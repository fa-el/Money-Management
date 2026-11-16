import { Injectable, Logger } from '@nestjs/common';
import { parseReceiptText, type OcrLine, type ReceiptFields } from '../parsers/receipt-text';

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/**
 * Ekstraksi struk memakai layanan OCR lokal (folder ocr-service/, PaddleOCR).
 * Aktif bila OCR_SERVICE_URL di-set. Gratis & offline: dokumen tidak keluar dari server Anda.
 */
@Injectable()
export class PaddleOcrExtractor {
  private readonly logger = new Logger(PaddleOcrExtractor.name);
  private readonly baseUrl = process.env.OCR_SERVICE_URL?.replace(/\/+$/, '') || null;
  private readonly timeoutMs = Number(process.env.OCR_TIMEOUT_MS || 120_000);

  get enabled() {
    return this.baseUrl !== null;
  }

  async extractReceipt(doc: { mimeType: string; data: Buffer }): Promise<ReceiptFields> {
    if (!this.baseUrl) throw new Error('Layanan OCR belum dikonfigurasi (OCR_SERVICE_URL kosong)');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(doc.data)], { type: doc.mimeType }), `struk${EXT[doc.mimeType] ?? ''}`);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/ocr`, { method: 'POST', body: form, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (e) {
      this.logger.warn(`Layanan OCR tidak dapat dihubungi: ${e.message}`);
      throw new Error('Layanan OCR tidak dapat dihubungi. Pastikan ocr-service sedang berjalan.');
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new Error(body?.detail ?? `Layanan OCR mengembalikan status ${res.status}`);
    }
    const { pages } = (await res.json()) as { pages: { page: number; lines: OcrLine[] }[] };
    // Gabungkan halaman (struk PDF panjang) dengan menggeser posisi vertikal
    let offset = 0;
    const lines: OcrLine[] = [];
    for (const p of pages) {
      const maxY = Math.max(0, ...p.lines.map((l) => l.box[3]));
      for (const l of p.lines) lines.push({ ...l, box: [l.box[0], l.box[1] + offset, l.box[2], l.box[3] + offset] });
      offset += maxY + 50;
    }
    if (!lines.length) throw new Error('Tidak ada teks yang terbaca. Pastikan foto struk jelas, terang, dan tidak buram.');
    return parseReceiptText(lines);
  }
}
