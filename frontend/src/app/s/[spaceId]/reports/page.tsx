"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { CashflowChart, CategoryBreakdown, SERIES, type CashflowPoint, type CategoryRow } from "@/components/charts";
import { useSpace } from "@/components/space-context";
import { StatTile } from "@/components/stat-tile";
import { Button, Card, ErrorState, Field, Input, Loading, Money, PageHeader, Select, Tabs } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { formatDate, monthRange, today } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { ACCOUNT_LABEL, type Summary } from "@/lib/types";

interface AccountReportRow {
  accountId: string;
  name: string;
  type: keyof typeof ACCOUNT_LABEL;
  openingBalance: string;
  income: string;
  expense: string;
  transferIn: string;
  transferOut: string;
  closingBalance: string;
}

const PRESETS = {
  month: () => monthRange(0),
  "last-month": () => monthRange(-1),
  "3-months": () => ({ from: monthRange(-2).from, to: monthRange(0).to }),
  year: () => ({ from: `${today().slice(0, 4)}-01-01`, to: `${today().slice(0, 4)}-12-31` }),
};

export default function ReportsPage() {
  const { space, accounts, categories } = useSpace();
  const [filters, setFilters] = useState({ ...monthRange(0), accountId: "", categoryId: "", groupBy: "" });
  const [catType, setCatType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const base = `/finance-spaces/${space.id}/reports`;
  const q = { from: filters.from, to: filters.to, accountId: filters.accountId, categoryId: filters.categoryId };

  const data = useFetch(async () => {
    const [summary, cashflow, cats, accs] = await Promise.all([
      api.get<Summary>(`${base}/summary`, q),
      api.get<{ series: CashflowPoint[]; groupBy: string }>(`${base}/cashflow`, { ...q, groupBy: filters.groupBy }),
      api.get<{ data: CategoryRow[]; total: string }>(`${base}/categories`, { ...q, categoryId: "", type: catType }),
      api.get<{ data: AccountReportRow[] }>(`${base}/accounts`, { from: filters.from, to: filters.to }),
    ]);
    return { summary, cashflow, cats, accs: accs.data };
  }, [space.id, JSON.stringify(filters), catType]);

  const s = data.data?.summary;

  return (
    <>
      <PageHeader
        title="Laporan"
        description="Rekap pemasukan & pengeluaran, perbandingan antarperiode, dan ringkasan per akun"
        actions={
          <a
            href={`/api/finance-spaces/${space.id}/transactions/export.csv${qs({ ...q, status: "VALID" })}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        }
      />
      <Card className="mb-6 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["month", "Bulan ini"],
              ["last-month", "Bulan lalu"],
              ["3-months", "3 bulan"],
              ["year", "Tahun ini"],
            ] as const
          ).map(([k, label]) => (
            <Button key={k} size="sm" variant="secondary" onClick={() => setFilters({ ...filters, ...PRESETS[k]() })}>
              {label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="Dari">
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>
          <Field label="Sampai">
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>
          <Field label="Akun">
            <Select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">Semua akun</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kategori">
            <Select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
              <option value="">Semua kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kelompokkan">
            <Select value={filters.groupBy} onChange={(e) => setFilters({ ...filters, groupBy: e.target.value })}>
              <option value="">Otomatis</option>
              <option value="day">Harian</option>
              <option value="week">Mingguan</option>
              <option value="month">Bulanan</option>
              <option value="year">Tahunan</option>
            </Select>
          </Field>
        </div>
      </Card>

      {data.error && <ErrorState message={data.error} onRetry={data.reload} />}
      {!data.data && data.loading && <Loading />}
      {s && data.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Pemasukan" value={<Money value={s.income} />} change={s.change.income} sub={<span>vs {formatDate(s.previous.period.from)}–{formatDate(s.previous.period.to)}</span>} />
            <StatTile label="Pengeluaran" value={<Money value={s.expense} />} change={s.change.expense} goodWhenUp={false} sub={<span>periode sebelumnya <Money value={s.previous.expense} /></span>} />
            <StatTile label="Selisih" value={<Money value={s.net} signed />} change={s.change.net} sub={<span>sebelumnya <Money value={s.previous.net} /></span>} />
            <StatTile label={filters.accountId ? "Saldo akun" : "Saldo akhir periode"} value={<Money value={s.totalBalance} />} sub={<span>{s.transactionCount} transaksi · transfer <Money value={s.transfer} /></span>} />
          </div>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Arus kas</h2>
            <CashflowChart series={data.data.cashflow.series} groupBy={data.data.cashflow.groupBy} height={320} />
          </Card>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Per kategori</h2>
                <Tabs
                  value={catType}
                  onChange={setCatType}
                  options={[
                    { value: "EXPENSE", label: "Pengeluaran" },
                    { value: "INCOME", label: "Pemasukan" },
                  ]}
                />
              </div>
              {data.data.cats.data.length ? (
                <CategoryBreakdown rows={data.data.cats.data} limit={10} color={catType === "EXPENSE" ? SERIES.expense : SERIES.income} />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">Tidak ada data</p>
              )}
            </Card>
            <Card className="overflow-hidden">
              <h2 className="px-5 pt-5 font-semibold">Per akun</h2>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">Akun</th>
                      <th className="px-3 py-2 text-right font-medium">Saldo awal</th>
                      <th className="px-3 py-2 text-right font-medium">Masuk</th>
                      <th className="px-3 py-2 text-right font-medium">Keluar</th>
                      <th className="px-5 py-2 text-right font-medium">Saldo akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.data.accs.map((a) => (
                      <tr key={a.accountId}>
                        <td className="px-5 py-2.5">
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-slate-500">{ACCOUNT_LABEL[a.type]}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Money value={a.openingBalance} />
                        </td>
                        <td className="px-3 py-2.5 text-right" title={`Pemasukan + transfer masuk`}>
                          <Money value={Number(a.income) + Number(a.transferIn)} />
                        </td>
                        <td className="px-3 py-2.5 text-right" title="Pengeluaran + transfer keluar">
                          <Money value={Number(a.expense) + Number(a.transferOut)} />
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold">
                          <Money value={a.closingBalance} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
