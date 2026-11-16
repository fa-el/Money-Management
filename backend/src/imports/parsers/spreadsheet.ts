import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

/** Membaca CSV (delimiter , ; atau tab terdeteksi otomatis) menjadi matriks string. */
export function readCsv(buffer: Buffer): string[][] {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  for (const ch of sample) if (ch in counts) counts[ch]++;
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return parse(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: false, trim: true });
}

/** Membaca sheet pertama XLSX menjadi matriks string. */
export async function readXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cell.value as unknown;
      let s: string;
      if (v instanceof Date) s = v.toISOString().slice(0, 10);
      else if (v && typeof v === 'object' && 'result' in (v as any)) s = String((v as any).result ?? '');
      else if (v && typeof v === 'object' && 'richText' in (v as any)) s = (v as any).richText.map((r: any) => r.text).join('');
      else s = v === null || v === undefined ? '' : String(v);
      values[col - 1] = s;
    });
    rows.push(Array.from(values, (v) => v ?? ''));
  });
  return rows;
}
