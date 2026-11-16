"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatMoney } from "@/lib/format";

/** Slot kategorikal tervalidasi (CVD-safe): 1 = biru, 2 = oranye. */
export const SERIES = { income: "#2a78d6", expense: "#eb6834" } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function periodLabel(period: string, groupBy: string) {
  const [y, m, d] = period.split("-");
  if (groupBy === "year") return y;
  if (groupBy === "month") return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export interface CashflowPoint {
  period: string;
  income: string;
  expense: string;
  net: string;
}

export function CashflowChart({ series, groupBy, height = 280 }: { series: CashflowPoint[]; groupBy: string; height?: number }) {
  const data = series.map((p) => ({ label: periodLabel(p.period, groupBy), income: Number(p.income), expense: Number(p.expense), net: Number(p.net) }));
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-slate-600" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.income }} /> Pemasukan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.expense }} /> Pengeluaran
        </span>
      </div>
      <div style={{ height }} role="img" aria-label="Grafik pemasukan dan pengeluaran per periode">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="20%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#cbd5e1" }} tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => formatCompact(v)} width={48} />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, color: "#0f172a" }}
              formatter={(value, name) => [formatMoney(Number(value)), name === "income" ? "Pemasukan" : "Pengeluaran"]}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            />
            <Bar dataKey="income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="expense" fill={SERIES.expense} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface CategoryRow {
  categoryId: string | null;
  name: string;
  icon: string | null;
  color: string;
  total: string;
  count: number;
  percentage: number;
}

/** Komposisi kategori sebagai daftar batang horizontal berperingkat (lebih mudah dibaca daripada pie). */
export function CategoryBreakdown({ rows, limit = 6, color = SERIES.expense }: { rows: CategoryRow[]; limit?: number; color?: string }) {
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const display = rest.length
    ? [
        ...top,
        {
          categoryId: "other",
          name: `Lainnya (${rest.length})`,
          icon: "•",
          color: "#94a3b8",
          total: rest.reduce((s, r) => s + Number(r.total), 0).toFixed(2),
          count: rest.reduce((s, r) => s + r.count, 0),
          percentage: Math.round(rest.reduce((s, r) => s + r.percentage, 0) * 10) / 10,
        },
      ]
    : top;
  const max = Math.max(...display.map((r) => Number(r.total)), 1);
  return (
    <ul className="space-y-3">
      {display.map((r) => (
        <li key={r.categoryId ?? "none"} title={`${r.name}: ${formatMoney(r.total)} · ${r.count} transaksi`}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-slate-700">
              <span className="w-5 text-center">{r.icon ?? "•"}</span>
              <span className="truncate">{r.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {formatMoney(r.total)} <span className="text-xs text-slate-500">· {r.percentage}%</span>
            </span>
          </div>
          <div className="ml-7 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(Number(r.total) / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
