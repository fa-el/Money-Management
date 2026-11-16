import { addPeriod, maskAccountNumbers } from './util';

describe('addPeriod', () => {
  it('menambah hari, minggu, bulan, tahun', () => {
    expect(addPeriod('2026-11-16', 'DAILY')).toBe('2026-11-17');
    expect(addPeriod('2026-11-16', 'WEEKLY')).toBe('2026-11-23');
    expect(addPeriod('2026-11-16', 'MONTHLY')).toBe('2026-12-16');
    expect(addPeriod('2026-11-16', 'YEARLY')).toBe('2027-11-16');
  });

  it('menjaga akhir bulan (31 Jan -> 28 Feb -> 31 Mar dihitung dari tanggal mulai)', () => {
    expect(addPeriod('2026-01-31', 'MONTHLY', 1)).toBe('2026-02-28');
    expect(addPeriod('2026-01-31', 'MONTHLY', 2)).toBe('2026-03-31');
    expect(addPeriod('2028-02-29', 'YEARLY', 1)).toBe('2029-02-28');
  });
});

describe('maskAccountNumbers', () => {
  it('menyamarkan nomor rekening panjang', () => {
    expect(maskAccountNumbers('TRSF 1234567890 BUDI')).toBe('TRSF ******7890 BUDI');
    expect(maskAccountNumbers('ATM 03/11')).toBe('ATM 03/11');
  });
});
