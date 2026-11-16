import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

const MODEL = 'claude-opus-5';

const ReceiptSchema = z.object({
  merchant: z.string().nullable().describe('Nama toko/merchant'),
  date: z.string().nullable().describe('Tanggal transaksi, format YYYY-MM-DD'),
  receipt_number: z.string().nullable(),
  subtotal: z.number().nullable(),
  discount: z.number().nullable().describe('Total diskon sebagai angka positif'),
  tax: z.number().nullable().describe('Pajak/PPN/PB1'),
  other_fees: z.number().nullable().describe('Biaya layanan/tambahan lain'),
  total: z.number().nullable().describe('Total akhir yang dibayar'),
  payment_method: z.string().nullable().describe('Tunai, debit, kredit, QRIS, e-wallet, dsb. bila tercetak'),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      unit_price: z.number(),
      line_total: z.number(),
    }),
  ),
  low_confidence_fields: z
    .array(z.string())
    .describe('Nama field (merchant, date, total, items, dst.) yang buram/terpotong/tidak yakin'),
  confidence: z.number().describe('Keyakinan keseluruhan 0..1'),
});
export type ReceiptExtraction = z.infer<typeof ReceiptSchema>;

const StatementSchema = z.object({
  bank_name: z.string().nullable(),
  account_number_masked: z.string().nullable().describe('Nomor rekening yang disamarkan, hanya 4 digit terakhir terlihat'),
  period_start: z.string().nullable().describe('YYYY-MM-DD'),
  period_end: z.string().nullable().describe('YYYY-MM-DD'),
  opening_balance: z.number().nullable(),
  ending_balance: z.number().nullable(),
  lines: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      description: z.string(),
      debit: z.number().nullable().describe('Uang keluar, angka positif'),
      credit: z.number().nullable().describe('Uang masuk, angka positif'),
      balance: z.number().nullable(),
    }),
  ),
  confidence: z.number().describe('Keyakinan keseluruhan 0..1'),
});
export type StatementExtraction = z.infer<typeof StatementSchema>;

const RECEIPT_PROMPT = `Baca struk/bon belanja ini dan ekstrak datanya.
- Nominal dalam angka biasa tanpa pemisah ribuan (Rp 25.500 -> 25500).
- Jika tahun tidak tertulis, perkirakan dari konteks; tandai "date" sebagai low confidence.
- Jangan mengarang nilai: isi null bila tidak tercetak/tidak terbaca, dan cantumkan field itu di low_confidence_fields.
- items berisi baris barang; abaikan baris subtotal/pajak/diskon/kembalian.`;

const STATEMENT_PROMPT = `Ini adalah e-statement / rekening koran bank. Ekstrak seluruh baris mutasi.
- debit = uang keluar, credit = uang masuk (angka positif, tanpa pemisah ribuan).
- Jangan masukkan baris saldo awal/akhir, subtotal, atau ringkasan ke "lines"; isi opening_balance/ending_balance sebagai gantinya.
- Biaya administrasi, pajak, dan bunga tetap dimasukkan sebagai baris mutasi.
- Samarkan setiap nomor rekening/kartu di semua field: tampilkan hanya 4 digit terakhir (contoh ******1234).
- Tanggal dalam format YYYY-MM-DD; gunakan tahun dari periode laporan bila baris hanya memuat tanggal/bulan.`;

type DocumentInput = { mimeType: string; data: Buffer };

/**
 * Ekstraksi dokumen memakai Claude (opsional, aktif bila ANTHROPIC_API_KEY di-set).
 * Hasilnya SELALU masuk tahap review; pengguna wajib menyetujui sebelum menjadi transaksi.
 */
@Injectable()
export class ClaudeExtractor {
  private readonly logger = new Logger(ClaudeExtractor.name);
  private readonly client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

  get enabled() {
    return this.client !== null;
  }

  private contentBlock(doc: DocumentInput): Anthropic.Beta.BetaContentBlockParam {
    const data = doc.data.toString('base64');
    if (doc.mimeType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    }
    return {
      type: 'image',
      source: { type: 'base64', media_type: doc.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data },
    };
  }

  private async run<T extends z.ZodType>(schema: T, doc: DocumentInput, prompt: string): Promise<z.infer<T>> {
    if (!this.client) throw new Error('Ekstraksi otomatis belum dikonfigurasi (ANTHROPIC_API_KEY kosong)');
    // Streaming agar dokumen panjang (e-statement banyak halaman) tidak terkena timeout HTTP
    const stream = this.client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      // Bila model utama menolak permintaan, server otomatis mencoba model cadangan
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: [this.contentBlock(doc), { type: 'text', text: prompt }] }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error('Dokumen tidak dapat diproses oleh layanan ekstraksi');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('Dokumen terlalu panjang untuk diekstrak sekaligus. Pisahkan per periode yang lebih pendek.');
    }
    const text = message.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new Error('Layanan ekstraksi tidak mengembalikan hasil');
    return schema.parse(JSON.parse(text.text));
  }

  extractReceipt(doc: DocumentInput): Promise<ReceiptExtraction> {
    return this.run(ReceiptSchema, doc, RECEIPT_PROMPT);
  }

  extractStatement(doc: DocumentInput): Promise<StatementExtraction> {
    return this.run(StatementSchema, doc, STATEMENT_PROMPT);
  }
}
