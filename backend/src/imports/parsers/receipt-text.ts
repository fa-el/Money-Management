import { parseAmount, parseDate } from './normalize';

/** Satu potong teks hasil OCR beserta kotak posisinya [x1, y1, x2, y2]. */
export interface OcrLine {
  text: string;
  score: number;
  box: [number, number, number, number];
  /** Opsional: 4 titik sudut teks; dipakai untuk meluruskan foto yang miring */
  poly?: [number, number][] | null;
}

export interface ReceiptFields {
  merchant: string | null;
  date: string | null;
  receipt_number: string | null;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  other_fees: number | null;
  total: number | null;
  payment_method: string | null;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  low_confidence_fields: string[];
  confidence: number;
}

interface Row {
  cells: OcrLine[];
  text: string;
  score: number;
  height: number;
  amounts: number[];
}

// Nominal: 25.500 | 25,500 | 1.250.000,00 | 25500 | Rp25.500 | 12.50
const AMOUNT_RE = /(?:rp\.?\s*)?-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|(?:rp\.?\s*)?-?\d+[.,]\d{1,2}(?!\d)|(?:rp\.?\s*)?\d{3,}/gi;
const DATE_RE =
  /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|mei|may|jun|jul|agu|agt|aug|sep|okt|oct|nov|des|dec)[a-z]*\.?\s+\d{2,4})\b/i;
const TIME_RE = /\b\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\b/g;

const KW = {
  subtotal: /\bsub\s*-?\s*total\b|\bsubtotal\b/i,
  grandTotal: /\b(grand\s*total|total\s*(bayar|belanja|harga|pembayaran|tagihan|transaksi|akhir)|net\s*total|amount\s*due|jumlah\s*(bayar|total|tagihan))\b/i,
  total: /\b(total|ttl|jumlah|tot)\b/i,
  notTotal: /\b(sub\s*-?\s*total|subtotal|total\s*(item|items|qty|kuantitas|disc|diskon|hemat|pajak|ppn|potongan|saving))\b/i,
  tax: /\b(ppn|pb\s*1|pajak|tax|vat|pbjt)\b/i,
  discount: /\b(disc|diskon|discount|potongan|hemat|promo|voucher|saving)\b/i,
  fee: /\b(service|servis|layanan|biaya\s*(admin|layanan|kemasan|pengiriman)|ongkir|packaging)\b/i,
  cash: /\b(tunai|cash|bayar|dibayar|kembali|kembalian|change|uang)\b/i,
  nonItem: /\b(telp|tel|phone|hp|npwp|kasir|cashier|jl|jln|jalan|terima\s*kasih|thank|member|poin|point|struk|nota|invoice|no\.?|tgl|tanggal|date|time|jam|pos|kode|barang\s*yang|harga\s*sudah|bill|inv|invoice|ref|order|meja|table|pelanggan|customer)\b/i,
};

const PAYMENT: [RegExp, string][] = [
  [/\bqris\b/i, 'QRIS'],
  [/\bgo-?pay\b/i, 'GoPay'],
  [/\bovo\b/i, 'OVO'],
  [/\bdana\b/i, 'DANA'],
  [/\bshopee\s*pay\b/i, 'ShopeePay'],
  [/\blink\s*aja\b/i, 'LinkAja'],
  [/\b(flazz|e-?money|brizzi|tapcash)\b/i, 'Kartu uang elektronik'],
  [/\b(kartu\s*kredit|credit\s*card|visa|master\s*card|mastercard)\b/i, 'Kartu kredit'],
  [/\b(debit|debet|edc)\b/i, 'Kartu debit'],
  [/\b(tunai|cash)\b/i, 'Tunai'],
];

function amountsIn(text: string): number[] {
  const withoutTimeDate = text.replace(DATE_RE, ' ').replace(TIME_RE, ' ');
  return (withoutTimeDate.match(AMOUNT_RE) ?? [])
    .map((m) => parseAmount(m))
    .filter((v): v is string => v !== null)
    .map(Number)
    .filter((n) => n > 0 && n < 1e12);
}

/**
 * Foto struk sering miring beberapa derajat sehingga nominal di kolom kanan bergeser
 * naik/turun dari labelnya. Hitung sudut median dari tepi atas teks, lalu putar balik
 * semua koordinat agar baris kembali horizontal.
 */
export function deskew(lines: OcrLine[]): OcrLine[] {
  const angles = lines
    .filter((l) => l.poly && l.poly.length === 4)
    .map((l) => {
      const [[x1, y1], [x2, y2]] = l.poly!;
      return { angle: Math.atan2(y2 - y1, x2 - x1), width: Math.hypot(x2 - x1, y2 - y1) };
    })
    .filter((a) => a.width > 40 && Math.abs(a.angle) < Math.PI / 6)
    .map((a) => a.angle)
    .sort((a, b) => a - b);
  if (angles.length < 3) return lines;
  const angle = angles[Math.floor(angles.length / 2)];
  if (Math.abs(angle) < 0.003) return lines;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return lines.map((l) => {
    const pts = l.poly && l.poly.length === 4 ? l.poly : ([[l.box[0], l.box[1]], [l.box[2], l.box[1]], [l.box[2], l.box[3]], [l.box[0], l.box[3]]] as [number, number][]);
    const rotated = pts.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
    const xs = rotated.map((p) => p[0]);
    const ys = rotated.map((p) => p[1]);
    return { ...l, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
}

/** Menyusun potongan teks OCR menjadi baris berdasarkan posisi vertikal. */
export function groupRows(input: OcrLine[]): Row[] {
  const lines = deskew(input);
  const sorted = [...lines]
    .filter((l) => l.text?.trim())
    .sort((a, b) => (a.box[1] + a.box[3]) / 2 - (b.box[1] + b.box[3]) / 2);
  const heights = sorted.map((l) => l.box[3] - l.box[1]).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 10;
  const groups: OcrLine[][] = [];
  for (const line of sorted) {
    const center = (line.box[1] + line.box[3]) / 2;
    const current = groups[groups.length - 1];
    const currentCenter = current ? current.reduce((s, l) => s + (l.box[1] + l.box[3]) / 2, 0) / current.length : -Infinity;
    if (current && Math.abs(center - currentCenter) <= median * 0.55) current.push(line);
    else groups.push([line]);
  }
  return groups.map((cells) => {
    cells.sort((a, b) => a.box[0] - b.box[0]);
    const text = cells.map((c) => c.text.trim()).join(' ');
    return {
      cells,
      text,
      score: cells.reduce((s, c) => s + c.score, 0) / cells.length,
      height: Math.max(...cells.map((c) => c.box[3] - c.box[1])),
      amounts: amountsIn(text),
    };
  });
}

const lastAmount = (r: Row) => (r.amounts.length ? r.amounts[r.amounts.length - 1] : null);
const letters = (s: string) => (s.match(/[a-z]/gi) ?? []).length;

/**
 * Mengurai teks OCR struk menjadi data terstruktur dengan aturan (tanpa AI).
 * Hasil selalu ditinjau pengguna; field yang tidak pasti dicantumkan di low_confidence_fields.
 */
export function parseReceiptText(lines: OcrLine[]): ReceiptFields {
  const rows = groupRows(lines);
  const low = new Set<string>();
  const usedScores: number[] = [];
  const use = (r: Row | undefined) => r && usedScores.push(r.score);

  // --- Tanggal
  let date: string | null = null;
  const currentYear = new Date().getFullYear();
  for (const r of rows) {
    const m = r.text.match(DATE_RE);
    const d = m ? parseDate(m[1]) : null;
    if (d && Number(d.slice(0, 4)) >= 2000 && Number(d.slice(0, 4)) <= currentYear + 1) {
      date = d;
      use(r);
      break;
    }
  }

  // --- Total: utamakan "grand total / total bayar", lalu "total"; hindari subtotal/total item
  const summaryRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.amounts.length > 0);
  const pick = (re: RegExp, exclude?: RegExp) =>
    summaryRows.filter(({ r }) => re.test(r.text) && !(exclude && exclude.test(r.text)));
  let totalRow =
    pick(KW.grandTotal).pop() ?? pick(KW.total, new RegExp(`${KW.notTotal.source}|${KW.cash.source}`, 'i')).pop();
  let total = totalRow ? lastAmount(totalRow.r) : null;
  if (totalRow) use(totalRow.r);

  const subtotalRow = pick(KW.subtotal).pop();
  const subtotal = subtotalRow ? lastAmount(subtotalRow.r) : null;
  const taxRow = pick(KW.tax, KW.total).pop();
  const tax = taxRow ? lastAmount(taxRow.r) : null;
  const discountRows = pick(KW.discount, KW.total);
  const discount = discountRows.length ? discountRows.reduce((s, { r }) => s + (lastAmount(r) ?? 0), 0) : null;
  const feeRow = pick(KW.fee, KW.total).pop();
  const otherFees = feeRow ? lastAmount(feeRow.r) : null;

  if (total === null) {
    // Cadangan: subtotal + pajak − diskon, atau nominal terbesar selain uang tunai/kembalian
    if (subtotal !== null) total = subtotal + (tax ?? 0) + (otherFees ?? 0) - (discount ?? 0);
    else {
      const candidates = summaryRows.filter(({ r }) => !KW.cash.test(r.text)).flatMap(({ r }) => r.amounts);
      total = candidates.length ? Math.max(...candidates) : null;
    }
    low.add('amount');
  }

  // --- Merchant: baris teratas yang berisi nama (bukan alamat/tanggal/angka), pilih font terbesar
  const firstSummary = Math.min(
    ...[totalRow?.i, subtotalRow?.i, ...discountRows.map((d) => d.i), taxRow?.i].filter((i): i is number => i !== undefined),
    rows.length,
  );
  const header = rows
    .slice(0, Math.min(5, firstSummary))
    .filter((r) => letters(r.text) >= 3 && !DATE_RE.test(r.text) && !KW.nonItem.test(r.text) && r.amounts.length === 0);
  const merchantRow = header.reduce<Row | null>((best, r) => (!best || r.height > best.height * 1.15 ? r : best), null);
  const merchant = merchantRow ? merchantRow.text.replace(/\s+/g, ' ').slice(0, 120) : null;
  if (merchantRow) use(merchantRow);
  else low.add('merchant');

  // --- Nomor struk
  let receiptNumber: string | null = null;
  for (const r of rows) {
    const m = r.text.match(/\b(?:no\.?\s*(?:struk|nota|trx|transaksi|invoice|bill|receipt|ref)?|struk|nota|invoice|inv|trx|bill|ref)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/.]{3,})/i);
    if (m && /\d/.test(m[1])) {
      receiptNumber = m[1];
      break;
    }
  }

  // --- Metode pembayaran
  let paymentMethod: string | null = null;
  const tail = rows.slice(totalRow ? totalRow.i : Math.floor(rows.length / 2)).map((r) => r.text).join(' ');
  for (const [re, label] of PAYMENT) {
    if (re.test(tail)) {
      paymentMethod = label;
      break;
    }
  }

  // --- Item: baris di antara header dan ringkasan yang diakhiri nominal
  const items: ReceiptFields['items'] = [];
  const startIndex = merchantRow ? rows.indexOf(merchantRow) + 1 : 0;
  let pendingName: string | null = null;
  for (const r of rows.slice(startIndex, firstSummary)) {
    const hasLetters = letters(r.text) >= 2;
    if (KW.nonItem.test(r.text) || DATE_RE.test(r.text) || KW.total.test(r.text) || KW.tax.test(r.text) || KW.cash.test(r.text)) {
      pendingName = null;
      continue;
    }
    if (!r.amounts.length) {
      pendingName = hasLetters ? r.text : null;
      continue;
    }
    const lineTotal = lastAmount(r)!;
    if (KW.discount.test(r.text)) continue;
    const qtyMatch = r.text.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:x|X|×|\*|@|pcs|PCS|buah)\s*/);
    // Format kafe/restoran: jumlah di depan nama, mis. "2 Es Kopi Susu   56.000"
    const leadingQty = !qtyMatch && r.amounts.length === 1 ? r.text.match(/^(\d{1,3})\s+(?=[a-z])/i) : null;
    let quantity = qtyMatch ? Number(qtyMatch[1].replace(',', '.')) : leadingQty ? Number(leadingQty[1]) : 1;
    let unitPrice = r.amounts.length >= 2 ? r.amounts[r.amounts.length - 2] : lineTotal / (quantity || 1);
    if (!qtyMatch && r.amounts.length >= 2 && unitPrice > 0) {
      const q = lineTotal / unitPrice;
      if (Math.abs(q - Math.round(q)) < 0.01 && q >= 1 && q < 1000) quantity = Math.round(q);
    }
    if (!quantity || quantity <= 0 || quantity > 10000) quantity = 1;
    if (Math.abs(unitPrice * quantity - lineTotal) > 1 && r.amounts.length < 2) unitPrice = lineTotal / quantity;

    let name = r.cells
      .map((c) => c.text)
      .join(' ')
      .replace(AMOUNT_RE, ' ')
      .replace(/(?:^|\s)\d+(?:[.,]\d+)?\s*(?:x|X|×|\*|@|pcs|PCS|buah)(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (leadingQty) name = name.replace(/^\d{1,3}\s+/, '');
    if (letters(name) < 2) name = pendingName ?? '';
    pendingName = null;
    if (!name) continue;
    items.push({ name: name.slice(0, 255), quantity, unit_price: Math.round(unitPrice * 100) / 100, line_total: lineTotal });
    use(r);
  }

  // --- Validasi silang untuk menandai bagian yang perlu diperiksa
  if (!date) low.add('date');
  if (items.length) {
    const sum = items.reduce((s, i) => s + i.line_total, 0);
    const expected = subtotal ?? (total !== null ? total - (tax ?? 0) - (otherFees ?? 0) + (discount ?? 0) : null);
    if (expected !== null && Math.abs(sum - expected) > 1) low.add('items');
  } else {
    low.add('items');
  }
  if (total !== null && subtotal !== null) {
    const computed = subtotal + (tax ?? 0) + (otherFees ?? 0) - (discount ?? 0);
    // Banyak struk sudah termasuk pajak di subtotal, jadi cek juga subtotal − diskon
    if (Math.abs(computed - total) > 1 && Math.abs(subtotal - (discount ?? 0) - total) > 1 && Math.abs(subtotal - total) > 1) low.add('amount');
  }
  if (totalRow && totalRow.r.score < 0.85) low.add('amount');
  if (merchantRow && merchantRow.score < 0.8) low.add('merchant');

  const avg = usedScores.length ? usedScores.reduce((a, b) => a + b, 0) / usedScores.length : 0;
  const confidence = Math.max(0, Math.min(1, avg * (1 - 0.12 * low.size)));

  return {
    merchant,
    date,
    receipt_number: receiptNumber,
    subtotal,
    discount,
    tax,
    other_fees: otherFees,
    total,
    payment_method: paymentMethod,
    items,
    low_confidence_fields: [...low],
    confidence: Math.round(confidence * 1000) / 1000,
  };
}
