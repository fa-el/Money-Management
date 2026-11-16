import { describe, expect, it } from 'bun:test';
import { deskew, parseReceiptText, type OcrLine } from './receipt-text';
// Hasil OCR PaddleOCR dari struk SINTETIS (foto miring ±3–4°), bukan data pribadi
import minimarket from './__fixtures__/ocr-struk1.json';
import cafe from './__fixtures__/ocr-struk2.json';

const lines = (fixture: { pages: { lines: unknown[] }[] }) => fixture.pages[0].lines as OcrLine[];

describe('parseReceiptText', () => {
  it('struk minimarket: item dengan "qty x harga" di baris kedua, diskon, tunai & kembalian', () => {
    const r = parseReceiptText(lines(minimarket));
    expect(r).toMatchObject({
      merchant: 'MINIMARKET SEJAHTERA',
      date: '2026-11-14',
      receipt_number: 'TRX-2611-0457',
      subtotal: 207800,
      discount: 7800,
      total: 200000, // bukan 250.000 (tunai) atau 50.000 (kembalian)
      payment_method: 'Tunai',
    });
    expect(r.items.map((i) => [i.name, i.quantity, i.unit_price, i.line_total])).toEqual([
      ['BERAS PANDAN WANGI 5KG', 1, 72500, 72500],
      ['MINYAK GORENG 2L', 2, 34900, 69800],
      ['TELUR AYAM 1KG', 1, 28000, 28000],
      ['SABUN MANDI CAIR', 3, 12500, 37500],
    ]);
    expect(r.low_confidence_fields).toEqual([]);
  });

  it('struk kafe: jumlah di depan nama, service & PB1, grand total, QRIS', () => {
    const r = parseReceiptText(lines(cafe));
    expect(r).toMatchObject({
      merchant: 'KOPI SENJA',
      date: '2026-11-15',
      receipt_number: 'INV/2026/11/0088',
      subtotal: 113000,
      other_fees: 5650,
      tax: 11865,
      total: 130515,
      payment_method: 'QRIS',
    });
    expect(r.items.map((i) => [i.name, i.quantity, i.line_total])).toEqual([
      ['Es Kopi Susu', 2, 56000],
      ['Croissant', 1, 32000],
      ['Americano', 1, 25000],
    ]);
  });

  it('menandai total & item untuk diperiksa bila tidak ada baris total', () => {
    const box = (y: number, x = 10): [number, number, number, number] => [x, y, x + 100, y + 20];
    const r = parseReceiptText([
      { text: 'WARUNG BU SRI', score: 0.99, box: box(0) },
      { text: 'Nasi Goreng', score: 0.95, box: box(40) },
      { text: '25.000', score: 0.95, box: box(40, 200) },
    ]);
    expect(r.total).toBe(25000);
    expect(r.low_confidence_fields).toContain('amount');
    expect(r.low_confidence_fields).toContain('date');
  });
});

describe('deskew', () => {
  it('meluruskan teks yang miring sehingga label & nominal kembali sebaris', () => {
    const angle = (5 * Math.PI) / 180;
    const rot = (x: number, y: number): [number, number] => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
    const make = (text: string, x: number, y: number, w: number): OcrLine => {
      const poly = [rot(x, y), rot(x + w, y), rot(x + w, y + 20), rot(x, y + 20)];
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      return { text, score: 1, poly, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    };
    const fixed = deskew([make('TOTAL', 0, 100, 80), make('200.000', 300, 100, 90), make('TUNAI', 0, 130, 80)]);
    const center = (l: OcrLine) => (l.box[1] + l.box[3]) / 2;
    expect(Math.abs(center(fixed[0]) - center(fixed[1]))).toBeLessThan(2);
    expect(center(fixed[2]) - center(fixed[0])).toBeGreaterThan(25);
  });
});
