import { parseAmount, parseDate } from './normalize';
import { parseStatementTable } from './statement-table';

describe('parseAmount', () => {
  it.each([
    ['1.234.567,89', '1234567.89'],
    ['1,234,567.89', '1234567.89'],
    ['Rp 50.000', '50000.00'],
    ['250.000,00 DB', '250000.00'],
    ['15000', '15000.00'],
    ['', null],
  ])('%s -> %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
});

describe('parseDate', () => {
  it('mendukung beberapa format', () => {
    expect(parseDate('03/11/2026')).toBe('2026-11-03');
    expect(parseDate('2026-11-03')).toBe('2026-11-03');
    expect(parseDate('03/11', 2026)).toBe('2026-11-03');
    expect(parseDate('3 Nov 2026')).toBe('2026-11-03');
    expect(parseDate('31/02/2026')).toBeNull();
  });
});

describe('parseStatementTable', () => {
  it('membaca kolom debit/kredit terpisah beserta saldo awal/akhir', () => {
    const rows = [
      ['Tanggal', 'Keterangan', 'Debit', 'Kredit', 'Saldo'],
      ['01/11/2026', 'Saldo Awal', '', '', '1.000.000,00'],
      ['02/11/2026', 'Gaji', '', '5.000.000,00', '6.000.000,00'],
      ['03/11/2026', 'Belanja', '250.000,00', '', '5.750.000,00'],
      ['30/11/2026', 'Saldo Akhir', '', '', '5.750.000,00'],
    ];
    const r = parseStatementTable(rows);
    const lines = r.lines.filter((l) => l.kind === 'LINE');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ date: '2026-11-02', credit: '5000000.00', debit: null });
    expect(lines[1]).toMatchObject({ date: '2026-11-03', debit: '250000.00', credit: null });
    expect(r.openingBalance).toBe('1000000.00');
    expect(r.endingBalance).toBe('5750000.00');
  });

  it('mengenali kolom DB/CR tanpa judul di sebelah kolom jumlah', () => {
    const rows = [
      ['Periode : 01/11/2026 - 30/11/2026'],
      ['Tanggal', 'Keterangan', 'Jumlah', '', 'Saldo'],
      ['02/11', 'Gaji', '5.000.000,00', 'CR', '6.000.000,00'],
      ['03/11', 'ATM', '100.000,00', 'DB', '5.900.000,00'],
    ];
    const lines = parseStatementTable(rows).lines;
    expect(lines.map((l) => [l.date, l.debit, l.credit])).toEqual([
      ['2026-11-02', null, '5000000.00'],
      ['2026-11-03', '100000.00', null],
    ]);
  });

  it('menolak file tanpa header yang dikenali', () => {
    expect(() => parseStatementTable([['a', 'b'], ['1', '2']])).toThrow(/Format tidak dikenali/);
  });
});
