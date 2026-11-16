"use client";

import { Download, Plus, Receipt, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionRow } from "@/components/transaction-row";
import { Button, Card, EmptyState, ErrorState, Input, Loading, Modal, Money, PageHeader, Select, Tabs } from "@/components/ui";
import { api, errorMessage, qs } from "@/lib/api";
import { formatDateTime, monthRange } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { TX_LABEL, type Paginated, type Transaction, type TxType } from "@/lib/types";

type TypeFilter = "ALL" | TxType;

export default function TransactionsPage() {
  const { space, accounts, categories, can, refresh } = useSpace();
  const toast = useToast();
  const initial = monthRange(0);
  const [filters, setFilters] = useState({ type: "ALL" as TypeFilter, accountId: "", categoryId: "", from: initial.from, to: initial.to, q: "", status: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; tx: Transaction | null; type: TxType }>({ open: false, tx: null, type: "EXPENSE" });
  const [detail, setDetail] = useState<Transaction | null>(null);

  // Setiap perubahan filter mengembalikan ke halaman 1
  const updateFilters = (next: typeof filters) => {
    setFilters(next);
    setPage(1);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = {
    type: filters.type === "ALL" ? undefined : filters.type,
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    from: filters.from,
    to: filters.to,
    q: filters.q,
    status: filters.status,
  };
  const list = useFetch(
    () => api.get<Paginated<Transaction>>(`/finance-spaces/${space.id}/transactions`, { ...query, page, pageSize: 25 }),
    [space.id, JSON.stringify(query), page],
  );

  const reload = () => {
    void list.reload();
    void refresh();
  };

  const openDetail = async (t: Transaction) => {
    try {
      setDetail(await api.get<Transaction>(`/finance-spaces/${space.id}/transactions/${t.id}`));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const action = async (kind: "void" | "restore" | "delete") => {
    if (!detail) return;
    if (kind === "delete" && !confirm("Hapus transaksi ini? Saldo akan dihitung ulang otomatis.")) return;
    try {
      if (kind === "delete") await api.del(`/finance-spaces/${space.id}/transactions/${detail.id}`);
      else await api.patch(`/finance-spaces/${space.id}/transactions/${detail.id}`, { status: kind === "void" ? "VOID" : "VALID" });
      toast.success(kind === "delete" ? "Transaksi dihapus" : kind === "void" ? "Transaksi dibatalkan (void)" : "Transaksi diaktifkan kembali");
      setDetail(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const filteredCategories = categories.filter((c) => filters.type === "ALL" || filters.type === "TRANSFER" || c.type === filters.type);

  return (
    <>
      <PageHeader
        title="Transaksi"
        description="Semua pemasukan, pengeluaran, dan transfer di ruang ini"
        actions={
          <>
            <a href={`/api/finance-spaces/${space.id}/transactions/export.csv${qs(query)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Export CSV
            </a>
            {can("MEMBER") && (
              <Button onClick={() => setForm({ open: true, tx: null, type: filters.type === "ALL" ? "EXPENSE" : filters.type })}>
                <Plus className="h-4 w-4" /> Catat transaksi
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs<TypeFilter>
            value={filters.type}
            onChange={(type) => updateFilters({ ...filters, type, categoryId: "" })}
            options={[
              { value: "ALL", label: "Semua" },
              { value: "INCOME", label: "Pemasukan" },
              { value: "EXPENSE", label: "Pengeluaran" },
              { value: "TRANSFER", label: "Transfer" },
            ]}
          />
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Cari keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Select value={filters.accountId} onChange={(e) => updateFilters({ ...filters, accountId: e.target.value })} aria-label="Filter akun">
            <option value="">Semua akun</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={filters.categoryId} disabled={filters.type === "TRANSFER"} onChange={(e) => updateFilters({ ...filters, categoryId: e.target.value })} aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => updateFilters({ ...filters, from: e.target.value })} aria-label="Dari tanggal" />
          <Input type="date" value={filters.to} onChange={(e) => updateFilters({ ...filters, to: e.target.value })} aria-label="Sampai tanggal" />
          <Select value={filters.status} onChange={(e) => updateFilters({ ...filters, status: e.target.value })} aria-label="Filter status">
            <option value="">Semua status</option>
            <option value="VALID">Valid</option>
            <option value="VOID">Dibatalkan</option>
          </Select>
        </div>
      </Card>

      <Card>
        {list.error ? (
          <div className="p-4">
            <ErrorState message={list.error} onRetry={list.reload} />
          </div>
        ) : !list.data ? (
          <Loading />
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<Receipt className="h-6 w-6" />} title="Tidak ada transaksi" description="Ubah filter atau catat transaksi baru." />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.data.data.map((t) => (
                <TransactionRow key={t.id} t={t} currency={space.currency} onClick={() => openDetail(t)} showCreator={space.type !== "PERSONAL"} />
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              <span>
                {list.data.meta.total} transaksi · halaman {list.data.meta.page} dari {list.data.meta.totalPages}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Sebelumnya
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>
                  Berikutnya
                </Button>
              </span>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail transaksi"
        footer={
          detail && can("MEMBER") ? (
            <>
              <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => action("delete")}>
                Hapus
              </Button>
              <Button variant="secondary" onClick={() => action(detail.status === "VOID" ? "restore" : "void")}>
                {detail.status === "VOID" ? "Aktifkan kembali" : "Batalkan (void)"}
              </Button>
              <Button
                onClick={() => {
                  setForm({ open: true, tx: detail, type: detail.type });
                  setDetail(null);
                }}
              >
                Ubah
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <dt className="text-slate-500">Jenis</dt>
            <dd className="col-span-2 font-medium">{TX_LABEL[detail.type]}</dd>
            <dt className="text-slate-500">Nominal</dt>
            <dd className="col-span-2">
              <Money value={detail.amount} type={detail.type} currency={space.currency} className="text-lg font-semibold" />
            </dd>
            <dt className="text-slate-500">{detail.type === "TRANSFER" ? "Dari → Ke" : "Akun"}</dt>
            <dd className="col-span-2">{detail.type === "TRANSFER" ? `${detail.account.name} → ${detail.destinationAccount?.name}` : detail.account.name}</dd>
            {detail.category && (
              <>
                <dt className="text-slate-500">Kategori</dt>
                <dd className="col-span-2">
                  {detail.category.icon} {detail.category.name}
                </dd>
              </>
            )}
            <dt className="text-slate-500">Tanggal</dt>
            <dd className="col-span-2">{formatDateTime(detail.transactionDate)}</dd>
            <dt className="text-slate-500">Keterangan</dt>
            <dd className="col-span-2">{detail.description || "-"}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="col-span-2">{detail.status === "VALID" ? "Valid" : "Dibatalkan — tidak dihitung di saldo & laporan"}</dd>
            <dt className="text-slate-500">Dicatat oleh</dt>
            <dd className="col-span-2">{detail.createdByName ?? "-"}</dd>
            {detail.importSource && (
              <>
                <dt className="text-slate-500">Sumber</dt>
                <dd className="col-span-2">
                  <Link className="text-emerald-700 hover:underline" href={`/s/${space.id}/import/${detail.importSource.importJobId}`}>
                    Dokumen Smart Import
                  </Link>
                  {detail.importSource.items.length > 0 && (
                    <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-xs">
                      {detail.importSource.items.map((i, idx) => (
                        <li key={idx} className="flex justify-between gap-2">
                          <span>
                            {Number(i.quantity)} × {i.itemName}
                          </span>
                          <Money value={i.lineTotal} />
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </>
            )}
          </dl>
        )}
      </Modal>

      <TransactionForm open={form.open} transaction={form.tx} defaultType={form.type} onClose={() => setForm({ ...form, open: false })} onSaved={reload} />
    </>
  );
}
