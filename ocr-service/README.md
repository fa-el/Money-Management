# OCR Service — PaddleOCR (gratis, offline)

Layanan kecil (FastAPI + [PaddleOCR 3.x](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/OCR.html))
untuk membaca **foto struk/bon** di Smart Import. Layanan ini hanya mengembalikan teks beserta posisinya. Penguraian
menjadi merchant, tanggal, total, pajak, diskon, dan item dilakukan backend
(`backend/src/imports/parsers/receipt-text.ts`).

Semua proses berjalan di mesin Anda; dokumen **tidak dikirim** ke layanan luar.

## Menjalankan (lokal)

Prasyarat: Python **3.10–3.13**.

```bash
cd ocr-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt        # ±1–2 GB termasuk PaddlePaddle
PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8866
```

Saat pertama kali start, model OCR (±100–200 MB) diunduh otomatis ke `~/.paddlex/`. Cek layanan:

```bash
curl http://localhost:8866/health
curl -F file=@struk.jpg http://localhost:8866/ocr
```

## Menjalankan (Docker)

```bash
docker compose --profile ocr up -d        # dari root repo
```

## Menghubungkan ke backend

Di `backend/.env`:

```
OCR_SERVICE_URL=http://localhost:8866
```

Restart backend. Urutan pembacaan struk: **Claude** (bila `ANTHROPIC_API_KEY` diisi) → **PaddleOCR** (bila
`OCR_SERVICE_URL` diisi) → isi manual. Bila layanan OCR mati atau gagal, struk tetap tersimpan dan bisa diisi manual.

## Konfigurasi (environment variable)

| Variabel | Default | Keterangan |
|---|---|---|
| `OCR_LANG` | `en` | Bahasa model; `en` cocok untuk huruf Latin/struk Indonesia |
| `OCR_VERSION` | (bawaan) | mis. `PP-OCRv5` bila ingin versi model tertentu |
| `OCR_DOC_ORIENTATION` | `true` | Memutar otomatis foto yang terbalik/miring 90° |
| `OCR_DOC_UNWARPING` | `false` | Meluruskan kertas melengkung (lebih lambat) |
| `OCR_TEXTLINE_ORIENTATION` | `false` | Deteksi orientasi per baris |
| `OCR_DEVICE` | `cpu` | `gpu:0` bila ada GPU yang didukung |
| `OCR_MAX_MB` | `10` | Batas ukuran file |

## Akurasi & tips

- Pada uji dengan foto struk miring/buram, **angka (total, subtotal, pajak, harga item) terbaca tepat**. Nama barang
  kadang salah satu-dua huruf. Field yang meragukan ditandai untuk diperiksa di layar review.
- Kemiringan foto dikoreksi otomatis dari sudut teks.
- Hasil terbaik: foto tegak lurus, terang, tidak buram, dan seluruh struk masuk bingkai.
- Satu struk ±4–6 detik di CPU (Apple Silicon).
