"use client";

import { ArrowRight, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CashflowChart, CategoryBreakdown, type CashflowPoint, type CategoryRow } from "@/components/charts";
import { useSpace } from "@/components/space-context";
import { StatTile } from "@/components/stat-tile";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionRow } from "@/components/transaction-row";
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Money, PageHeader, ProgressBar, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, monthLabel, monthRange, today } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { type Budget, type Paginated, type Summary, type Transaction } from "@/lib/types";

type Period = "today" | "month" | "last-month" | "year";

function rangeFor(p: Period) {
  const t = today();
  if (p === "today") return { from: t, to: t };
  if (p === "month") return monthRange(0);
  if (p === "last-month") return monthRange(-1);
  return { from: `${t.slice(0, 4)}-01-01`, to: `${t.slice(0, 4)}-12-31` };
}

export default function DashboardPage() {
  const { space, accounts, can, refresh } = useSpace();
  const [period, setPeriod] = useState<Period>("month");
  const [formOpen, setFormOpen] = useState(false);
  const range = rangeFor(period);
  const base = `/finance-spaces/${space.id}`;

  const data = useFetch(async () => {
    // Grafik tren: harian untuk periode bulan, bulanan untuk tahun; untuk "hari ini" tampilkan 14 hari terakhir
    const trend = period === "today" ? { from: addDays(range.to, -13), to: range.to } : range;
    const [summary, cashflow, categories, recent, budgets] = await Promise.all([
      api.get<Summary>(`${base}/reports/summary`, range),
      api.get<{ series: CashflowPoint[]; groupBy: string }>(`${base}/reports/cashflow`, { ...trend, groupBy: period === "year" ? "month" : "day" }),
      api.get<{ data: CategoryRow[] }>(`${base}/reports/categories`, { ...range, type: "EXPENSE" }),
      api.get<Paginated<Transaction>>(`${base}/transactions`, { pageSize: 6 }),
      api.get<Budget[]>(`${base}/budgets`, { activeOn: today() }),
    ]);
    return { summary, cashflow, categories: categories.data, recent: recent.data, budgets };
  }, [space.id, period]);

  const reload = () => {
    void data.reload();
    void refresh();
  };

  const s = data.data?.summary;
  const periodText = period === "today" ? "hari ini" : period === "year" ? `tahun ${range.from.slice(0, 4)}` : monthLabel(range.from);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan ${periodText}`}
        actions={
          <>
            <Tabs<Period>
              value={period}
              onChange={setPeriod}
              options={[
                { value: "today", label: "Hari ini" },
                { value: "month", label: "Bulan ini" },
                { value: "last-month", label: "Bulan lalu" },
                { value: "year", label: "Tahun ini" },
              ]}
            />
            {can("MEMBER") && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Transaksi
              </Button>
            )}
          </>
        }
      />

      {accounts.length === 0 && can("EDITOR") && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Langkah awal: <Link href={`/s/${space.id}/accounts`} className="font-semibold underline">tambahkan akun</Link> (rekening, kas, atau dompet digital) beserta saldo awalnya, lalu mulai catat transaksi.
        </Card>
      )}

      {data.error && <ErrorState message={data.error} onRetry={data.reload} />}
      {!data.data && data.loading && <Loading />}

      {s && data.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total saldo" value={<Money value={s.totalBalance} currency={space.currency} />} sub={<span>{accounts.filter((a) => a.isActive).length} akun aktif</span>} />
            <StatTile label="Pemasukan" value={<Money value={s.income} currency={space.currency} />} change={s.change.income} sub={<span>vs periode lalu</span>} />
            <StatTile label="Pengeluaran" value={<Money value={s.expense} currency={space.currency} />} change={s.change.expense} goodWhenUp={false} sub={<span>vs periode lalu</span>} />
            <StatTile
              label="Selisih (net)"
              value={<Money value={s.net} currency={space.currency} signed />}
              sub={<span>{s.savingsRate !== null ? `Rasio tabungan ${s.savingsRate}%` : `${s.transactionCount} transaksi`}</span>}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 font-semibold">Tren arus kas</h2>
              <CashflowChart series={data.data.cashflow.series} groupBy={data.data.cashflow.groupBy} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 font-semibold">Pengeluaran per kategori</h2>
              {data.data.categories.length ? <CategoryBreakdown rows={data.data.categories} /> : <p className="py-10 text-center text-sm text-slate-500">Belum ada pengeluaran pada periode ini</p>}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="font-semibold">Transaksi terbaru</h2>
                <Link href={`/s/${space.id}/transactions`} className="flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
                  Lihat semua <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              {data.data.recent.length === 0 ? (
                <EmptyState title="Belum ada transaksi" description="Transaksi yang Anda catat akan tampil di sini." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.data.recent.map((t) => (
                    <TransactionRow key={t.id} t={t} currency={space.currency} />
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="mb-3 font-semibold">Akun</h2>
                {accounts.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada akun.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {accounts
                      .filter((a) => a.isActive)
                      .map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <Wallet className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate">{a.name}</span>
                          </span>
                          <Money value={a.balance} currency={space.currency} className="font-medium" />
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Anggaran aktif</h2>
                  <Link href={`/s/${space.id}/budgets`} className="text-xs font-medium text-emerald-700 hover:underline">
                    Kelola
                  </Link>
                </div>
                {data.data.budgets.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada anggaran untuk periode ini.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.data.budgets.slice(0, 5).map((b) => (
                      <li key={b.id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span>
                            {b.category.icon} {b.category.name}
                          </span>
                          {b.status !== "OK" ? (
                            <Badge color={b.status === "OVER" ? "red" : "amber"}>{b.status === "OVER" ? "Terlampaui" : "Hampir habis"} · {b.usage}%</Badge>
                          ) : (
                            <span className="text-xs text-slate-500">{b.usage}%</span>
                          )}
                        </div>
                        <ProgressBar value={b.usage} status={b.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={reload} />
    </>
  );
}
