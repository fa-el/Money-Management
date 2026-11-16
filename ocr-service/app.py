"""
Layanan OCR lokal untuk Smart Import (struk/bon) memakai PaddleOCR 3.x.

Endpoint:
  GET  /health  -> status & konfigurasi model
  POST /ocr     -> multipart/form-data field "file" (JPG/PNG/WEBP/PDF)
                   respons: { "pages": [ { "page": 0, "lines": [ {text, score, box}, ... ] } ] }

Layanan ini hanya mengembalikan teks + posisi. Penguraian menjadi data struk
(merchant, tanggal, total, item) dilakukan backend NestJS.
Semua proses berjalan di mesin ini; dokumen tidak dikirim ke layanan luar.
"""

import os
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR

MAX_BYTES = int(os.getenv("OCR_MAX_MB", "10")) * 1024 * 1024
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


def env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes"}


# Konfigurasi model (lihat README). Default: model PP-OCRv5 bawaan, teks Latin/Inggris.
OCR_CONFIG = {
    "lang": os.getenv("OCR_LANG", "en"),
    # Memutar otomatis foto yang terbalik/miring 90°
    "use_doc_orientation_classify": env_bool("OCR_DOC_ORIENTATION", True),
    # Meluruskan kertas yang melengkung (lebih lambat)
    "use_doc_unwarping": env_bool("OCR_DOC_UNWARPING", False),
    "use_textline_orientation": env_bool("OCR_TEXTLINE_ORIENTATION", False),
    "device": os.getenv("OCR_DEVICE", "cpu"),
}
if os.getenv("OCR_VERSION"):
    OCR_CONFIG["ocr_version"] = os.environ["OCR_VERSION"]

app = FastAPI(title="Money Management OCR", version="1.0.0")
_ocr: PaddleOCR | None = None
# Instance PaddleOCR tidak dijamin thread-safe: proses satu dokumen per waktu
_lock = threading.Lock()


def get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(**OCR_CONFIG)
    return _ocr


@app.on_event("startup")
def warm_up() -> None:
    # Memuat (dan bila perlu mengunduh) model sekali saat start
    get_ocr()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "paddleocr", "config": OCR_CONFIG}


def to_list(value):
    return value.tolist() if hasattr(value, "tolist") else value


@app.post("/ocr")
def ocr(file: UploadFile = File(...)) -> dict:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Format {ext or '?'} tidak didukung")
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File terlalu besar")

    with tempfile.NamedTemporaryFile(suffix=ext) as tmp:
        tmp.write(data)
        tmp.flush()
        try:
            with _lock:
                results = list(get_ocr().predict(tmp.name))
        except Exception as e:  # noqa: BLE001 — kembalikan pesan yang jelas ke backend
            raise HTTPException(422, f"Gagal membaca dokumen: {e}") from e

    pages = []
    for index, res in enumerate(results):
        r = res.json.get("res", res.json)
        texts = r.get("rec_texts", [])
        scores = to_list(r.get("rec_scores", []))
        boxes = to_list(r.get("rec_boxes", []))
        polys = [to_list(p) for p in r.get("rec_polys", [])] or [None] * len(texts)
        lines = [
            {
                "text": t,
                "score": round(float(s), 4),
                "box": [int(v) for v in b],
                # 4 titik sudut teks (kiri-atas, kanan-atas, kanan-bawah, kiri-bawah) untuk koreksi kemiringan
                "poly": [[int(x), int(y)] for x, y in p] if p is not None else None,
            }
            for t, s, b, p in zip(texts, scores, boxes, polys)
            if str(t).strip()
        ]
        pages.append({"page": index, "lines": lines})
    return {"pages": pages}
