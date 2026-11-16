"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ImportStatus } from "@/components/import-status";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ErrorState, Field, Input, Loading, Modal, Money, MoneyInput, PageHeader, Select, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { ImportDetail, ImportRecord, ImportRecordData, TxType } from "@/lib/types";

export default function ImportReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { space, accounts, categories, can, refresh } = useSpace();
  const toast = useToast();
  const router = useRouter();
  const base = `/finance-spaces/${space.id}/imports/${jobId}`;
  const job = useFetch(() => api.get<ImportDetail>(base), [base]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const canEdit = can("MEMBER");

  // Polling selama dokumen masih diproses
  useEffect(() => {
    if (job.data && (job.data.status === "PROCESSING" || job.data.status === "UPLOADED")) {
      const t = setTimeout(() => void job.reload(), 1500);
      return () => clearTimeout(t);
    }
  }, [job.data, job]);

  const patchRecord = async (r: ImportRecord, body: { data?: Partial<ImportRecordData>; reviewStatus?: ImportRecord["reviewStatus"]; items?: unknown[] }) => {
    // Pembaruan optimistis agar tabel terasa responsif
    job.setData((d) =>
      d
        ? {
            ...d,
            records: d.records.map((x) =>
              x.id === r.id ? { ...x, reviewStatus: body.reviewStatus ?? x.reviewStatus, normalizedData: { ...x.normalizedData, ...(body.data ?? {}) } } : x,
            ),
          }
        : d,
    );
    try {
      await api.patch(`${base}/records/${r.id}`, body);
    } catch (e) {
      toast.error(errorMessage(e));
    }
    void job.reload();
  };

  const bulk = async (body: { reviewStatus?: ImportRecord["reviewStatus"]; categoryId?: string }) => {
    if (!selected.size) return;
    try {
      await api.post(`${base}/records/bulk`, { recordIds: [...selected], ...body });
      setSelected(new Set());
      void job.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const setJobAccount = async (accountId: string) => {
    try {
      job.setData(await api.patch<ImportDetail>(base, { accountId: accountId || undefined }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const commit = async () => {
    setCommitting(true);
    try {
      const res = await api.post<{ imported: number }>(`${base}/commit`);
      toast.success(`${res.imported} transaksi berhasil diimpor`);
      setConfirmOpen(false);
      void job.reload();
      void refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCommitting(false);
    }
  };

  const remove = async () => {
    if (!confirm("Hapus dokumen sumber ini? Transaksi yang sudah diimpor tetap tersimpan.")) return;
    try {
      await api.del(base);
      toast.success("Dokumen dihapus");
      router.push(`/s/${space.id}/import`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const reprocess = async () => {
    await api.post(`${base}/reprocess`).catch((e) => toast.error(errorMessage(e)));
    void job.reload();
  };

  if (job.error) return <ErrorState message={job.error} onRetry={job.reload} />;
  if (!job.data) return <Loading />;
  const d = job.data;
  const processing = d.status === "PROCESSING" || d.status === "UPLOADED";
  const reviewable = d.records.filter((r) => r.recordType === "STATEMENT_LINE" || r.recordType === "RECEIPT");
  const pendingApproved = reviewable.filter((r) => r.reviewStatus === "APPROVED" && !r.transactionId);

  return (
    <>
      <Link href={`/s/${space.id}/import`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Smart Import
      </Link>
      <PageHeader
        title={d.file.originalName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ImportStatus status={d.status} />
            {d.sourceType === "RECEIPT" ? "Struk / bon" : "E-statement"} · diunggah {formatDateTime(d.createdAt)}
            {d.periodStart && ` · periode ${formatDate(d.periodStart)} – ${formatDate(d.periodEnd)}`}
          </span>
        }
        actions={
          <>
            <a href={`/api${base}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" /> Dokumen asli
            </a>
            {canEdit && (
              <>
                <Button variant="secondary" onClick={reprocess} disabled={processing} title="Baca ulang dokumen (baris yang belum diimpor diganti)">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button variant="secondary" onClick={remove} title="Hapus dokumen sumber">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button onClick={() => setConfirmOpen(true)} disabled={!pendingApproved.length}>
                  <CheckCircle2 className="h-4 w-4" /> Impor {pendingApproved.length || ""} transaksi
                </Button>
              </>
            )}
          </>
        }
      />

      {processing && <Loading label="Dokumen sedang dibaca..." />}
      {d.status === "FAILED" && <ErrorState message={`Gagal memproses dokumen: ${d.errorMessage ?? "-"}`} onRetry={reprocess} />}
      {d.errorMessage && d.status !== "FAILED" && (
        <div className="mb-4 flex gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {d.errorMessage}
        </div>
      )}

      {!processing && d.status !== "FAILED" && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <Field label={d.sourceType === "E_STATEMENT" ? "Akun rekening" : "Akun default"}>
                <Select value={d.accountId ?? ""} disabled={!canEdit} onChange={(e) => setJobAccount(e.target.value)}>
                  <option value="">Pilih akun</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </Card>
            <Card className="p-4 text-sm">
              <p className="text-slate-500">Disetujui / total</p>
              <p className="mt-1 text-xl font-semibold">
                {d.summary.approved} / {d.summary.total}
              </p>
              <p className="text-xs text-slate-500">{d.summary.imported} sudah menjadi transaksi</p>
            </Card>
            <Card className="p-4 text-sm">
              <p className="text-slate-500">Yang disetujui</p>
              <p className="mt-1">
                <Money value={d.summary.approvedIncome} type="INCOME" /> · <Money value={d.summary.approvedExpense} type="EXPENSE" />
              </p>
              {Number(d.summary.approvedTransfer) > 0 && (
                <p className="text-xs">
                  Transfer <Money value={d.summary.approvedTransfer} />
                </p>
              )}
            </Card>
            <Card className={cn("p-4 text-sm", d.summary.possibleDuplicates > 0 && "border-amber-300 bg-amber-50")}>
              <p className="text-slate-500">Kemungkinan duplikat</p>
              <p className="mt-1 text-xl font-semibold">{d.summary.possibleDuplicates}</p>
              <p className="text-xs text-slate-500">Periksa baris bertanda ⚠ sebelum menyetujui</p>
            </Card>
          </div>

          {d.reconciliation && <Reconciliation r={d.reconciliation} />}

          {d.sourceType === "E_STATEMENT" ? (
            <StatementTable
              records={reviewable}
              selected={selected}
              setSelected={setSelected}
              onPatch={patchRecord}
              onBulk={bulk}
              canEdit={canEdit}
              accounts={accounts}
              categories={categories}
              jobAccountId={d.accountId}
              spaceId={space.id}
            />
          ) : (
            reviewable.map((r) => <ReceiptReview key={r.id} record={r} fileUrl={`/api${base}/file`} mimeType={d.file.mimeType} onPatch={patchRecord} canEdit={canEdit} spaceId={space.id} />)
          )}
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Konfirmasi impor"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button onClick={commit} loading={committing}>
              Impor sekarang
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            <b>{pendingApproved.length}</b> baris yang disetujui akan dibuat sebagai transaksi final. Baris yang tidak disetujui tidak akan disimpan.
          </p>
          <ul className="space-y-1 rounded-lg bg-slate-50 p-3">
            {(["INCOME", "EXPENSE", "TRANSFER"] as TxType[]).map((t) => {
              const rows = pendingApproved.filter((r) => r.normalizedData.type === t);
              if (!rows.length) return null;
              return (
                <li key={t} className="flex justify-between">
                  <span>
                    {rows.length} {t === "INCOME" ? "pemasukan" : t === "EXPENSE" ? "pengeluaran" : "transfer"}
                  </span>
                  <Money value={rows.reduce((s, r) => s + Number(r.normalizedData.amount ?? 0), 0)} type={t} />
                </li>
              );
            })}
          </ul>
          {pendingApproved.some((r) => r.duplicates.length) && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Sebagian baris yang disetujui mirip transaksi yang sudah ada. Pastikan bukan pencatatan ganda.
            </p>
          )}
          {d.reconciliation?.balanced === false && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Rekonsiliasi saldo e-statement belum cocok (selisih <Money value={d.reconciliation.difference} />).
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

function Reconciliation({ r }: { r: NonNullable<ImportDetail["reconciliation"]> }) {
  return (
    <Card className={cn("mb-4 p-4", r.balanced === true ? "border-emerald-200" : r.balanced === false ? "border-amber-300" : "")}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-semibold">Rekonsiliasi saldo</span>
        <span>
          Saldo awal <b>{r.openingBalance !== null ? <Money value={r.openingBalance} /> : "-"}</b>
        </span>
        <span>
          + Kredit <Money value={r.totalCredit} />
        </span>
        <span>
          − Debit <Money value={r.totalDebit} />
        </span>
        <span>
          = <b>{r.computedEndingBalance !== null ? <Money value={r.computedEndingBalance} /> : "-"}</b>
        </span>
        <span>
          Saldo akhir dokumen <b>{r.endingBalance !== null ? <Money value={r.endingBalance} /> : "-"}</b>
        </span>
        {r.balanced === true && (
          <Badge color="green">
            <CheckCircle2 className="h-3 w-3" /> Cocok
          </Badge>
        )}
        {r.balanced === false && (
          <Badge color="amber">
            <AlertTriangle className="h-3 w-3" /> Selisih <Money value={r.difference} />
          </Badge>
        )}
        {r.balanced === null && <span className="text-xs text-slate-500">Tidak dapat dihitung (saldo awal/akhir tidak terbaca)</span>}
      </div>
    </Card>
  );
}

function StatementTable({
  records,
  selected,
  setSelected,
  onPatch,
  onBulk,
  canEdit,
  accounts,
  categories,
  jobAccountId,
  spaceId,
}: {
  records: ImportRecord[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onPatch: (r: ImportRecord, body: { data?: Partial<ImportRecordData>; reviewStatus?: ImportRecord["reviewStatus"] }) => void;
  onBulk: (body: { reviewStatus?: ImportRecord["reviewStatus"]; categoryId?: string }) => void;
  canEdit: boolean;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; type: string; icon: string | null; isActive: boolean }[];
  jobAccountId: string | null;
  spaceId: string;
}) {
  const [bulkCategory, setBulkCategory] = useState("");
  const selectable = records.filter((r) => !r.transactionId);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Card className="overflow-hidden">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-600">{selected.size} dipilih</span>
          <Button size="sm" disabled={!selected.size} onClick={() => onBulk({ reviewStatus: "APPROVED" })}>
            Setujui
          </Button>
          <Button size="sm" variant="secondary" disabled={!selected.size} onClick={() => onBulk({ reviewStatus: "IGNORED" })}>
            Abaikan
          </Button>
          <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => onBulk({ reviewStatus: "PENDING" })}>
            Reset
          </Button>
          <span className="ml-auto flex items-center gap-2">
            <Select className="w-48 py-1.5" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
              <option value="">Set kategori...</option>
              {categories.filter((c) => c.isActive).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name} ({c.type === "INCOME" ? "masuk" : "keluar"})
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" disabled={!selected.size || !bulkCategory} onClick={() => onBulk({ categoryId: bulkCategory })}>
              Terapkan
            </Button>
          </span>
        </div>
      )}
      {!jobAccountId && <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">Pilih akun rekening di atas sebelum mengimpor.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-10 px-4 py-2">
                {canEdit && <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)))} aria-label="Pilih semua" />}
              </th>
              <th className="px-2 py-2 font-medium">Tanggal</th>
              <th className="px-2 py-2 font-medium">Keterangan</th>
              <th className="px-2 py-2 text-right font-medium">Debit</th>
              <th className="px-2 py-2 text-right font-medium">Kredit</th>
              <th className="px-2 py-2 font-medium">Jenis</th>
              <th className="px-2 py-2 font-medium">Kategori / akun lawan</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => {
              const n = r.normalizedData;
              const locked = !canEdit || !!r.transactionId;
              return (
                <tr key={r.id} className={cn(r.reviewStatus === "IGNORED" && "bg-slate-50 text-slate-400", r.reviewStatus === "APPROVED" && !r.transactionId && "bg-emerald-50/40")}>
                  <td className="px-4 py-2 align-top">{!r.transactionId && canEdit && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Pilih baris" />}</td>
                  <td className="whitespace-nowrap px-2 py-2 align-top">{n.date ? formatDate(n.date) : <span className="text-rose-600">?</span>}</td>
                  <td className="max-w-xs px-2 py-2 align-top">
                    <p className="break-words">{n.description}</p>
                    {r.duplicates.length > 0 && !r.transactionId && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          Mirip:{" "}
                          {r.duplicates.map((x, i) => (
                            <span key={x.id}>
                              {i > 0 && "; "}
                              {x.description ?? "(tanpa keterangan)"} {formatDate(x.date)}
                              {x.alreadyImported && " — sudah pernah diimpor"}
                            </span>
                          ))}
                        </span>
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums">{n.debit ? <Money value={n.debit} /> : ""}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums">{n.credit ? <Money value={n.credit} /> : ""}</td>
                  <td className="px-2 py-2 align-top">
                    <Select
                      className="w-36 py-1"
                      disabled={locked}
                      value={n.type}
                      onChange={(e) => onPatch(r, { data: { type: e.target.value as TxType } })}
                    >
                      <option value="INCOME">Pemasukan</option>
                      <option value="EXPENSE">Pengeluaran</option>
                      <option value="TRANSFER">Transfer</option>
                    </Select>
                  </td>
                  <td className="px-2 py-2 align-top">
                    {n.type === "TRANSFER" ? (
                      <Select className="w-48 py-1" disabled={locked} value={n.counterpartAccountId ?? ""} onChange={(e) => onPatch(r, { data: { counterpartAccountId: e.target.value || null } })}>
                        <option value="">{n.credit && !n.debit ? "Dari akun..." : "Ke akun..."}</option>
                        {accounts.filter((a) => a.id !== jobAccountId).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Select className="w-48 py-1" disabled={locked} value={n.categoryId ?? ""} onChange={(e) => onPatch(r, { data: { categoryId: e.target.value || null } })}>
                        <option value="">Tanpa kategori</option>
                        {categories.filter((c) => c.type === n.type && (c.isActive || c.id === n.categoryId)).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    {r.transactionId ? (
                      <Link href={`/s/${spaceId}/transactions`} className="whitespace-nowrap">
                        <Badge color="green">Diimpor</Badge>
                      </Link>
                    ) : canEdit ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onPatch(r, { reviewStatus: r.reviewStatus === "APPROVED" ? "PENDING" : "APPROVED" })}
                          className={cn("rounded-md px-2 py-1 text-xs font-medium", r.reviewStatus === "APPROVED" ? "bg-emerald-600 text-white" : "bg-white ring-1 ring-slate-300 hover:bg-slate-50")}
                        >
                          {r.reviewStatus === "APPROVED" ? "Disetujui" : "Setujui"}
                        </button>
                        <button
                          onClick={() => onPatch(r, { reviewStatus: r.reviewStatus === "IGNORED" ? "PENDING" : "IGNORED" })}
                          className={cn("rounded-md px-2 py-1 text-xs font-medium", r.reviewStatus === "IGNORED" ? "bg-slate-600 text-white" : "text-slate-500 hover:bg-slate-100")}
                        >
                          {r.reviewStatus === "IGNORED" ? "Diabaikan" : "Abaikan"}
                        </button>
                      </div>
                    ) : (
                      <Badge>{r.reviewStatus}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type ItemRow = { itemName: string; quantity: string; unitPrice: string; lineTotal: string };

function ReceiptReview({
  record,
  fileUrl,
  mimeType,
  onPatch,
  canEdit,
  spaceId,
}: {
  record: ImportRecord;
  fileUrl: string;
  mimeType: string;
  onPatch: (r: ImportRecord, body: { data?: Partial<ImportRecordData>; reviewStatus?: ImportRecord["reviewStatus"]; items?: unknown[] }) => Promise<void>;
  canEdit: boolean;
  spaceId: string;
}) {
  const { accounts, categories } = useSpace();
  const n = record.normalizedData;
  const low = new Set(n.lowConfidenceFields ?? []);
  const [form, setForm] = useState({
    merchant: n.merchant ?? "",
    date: n.date ?? "",
    amount: n.amount ? Number(n.amount).toString() : "",
    accountId: n.accountId ?? "",
    categoryId: n.categoryId ?? "",
    description: n.description ?? "",
    paymentMethod: n.paymentMethod ?? "",
    receiptNumber: n.receiptNumber ?? "",
    subtotal: n.subtotal ? Number(n.subtotal).toString() : "",
    discount: n.discount ? Number(n.discount).toString() : "",
    tax: n.tax ? Number(n.tax).toString() : "",
  });
  const [items, setItems] = useState<ItemRow[]>(
    record.items.map((i) => ({ itemName: i.itemName, quantity: Number(i.quantity).toString(), unitPrice: Number(i.unitPrice).toString(), lineTotal: Number(i.lineTotal).toString() })),
  );
  const [saving, setSaving] = useState(false);
  const locked = !canEdit || !!record.transactionId;
  const itemsTotal = items.reduce((s, i) => s + Number(i.lineTotal || 0), 0);
  const warn = (field: string) => (low.has(field) ? "Periksa: pembacaan kurang yakin" : undefined);

  const save = async (approve: boolean) => {
    if (approve && (!form.date || !form.amount)) return;
    setSaving(true);
    const opt = (v: string) => (v ? v : null);
    await onPatch(record, {
      data: {
        merchant: opt(form.merchant),
        date: form.date || undefined,
        amount: form.amount || undefined,
        accountId: opt(form.accountId),
        categoryId: opt(form.categoryId),
        description: form.description,
        paymentMethod: opt(form.paymentMethod),
        receiptNumber: opt(form.receiptNumber),
        subtotal: opt(form.subtotal),
        discount: opt(form.discount),
        tax: opt(form.tax),
      } as Partial<ImportRecordData>,
      items: items
        .filter((i) => i.itemName.trim())
        .map((i) => ({ itemName: i.itemName, quantity: Number(i.quantity || 1), unitPrice: Number(i.unitPrice || 0), lineTotal: Number(i.lineTotal || 0) })),
      reviewStatus: approve ? "APPROVED" : record.reviewStatus,
    });
    setSaving(false);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <p className="border-b border-slate-100 px-4 py-2 text-sm font-medium">Pratinjau dokumen</p>
        {mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt="Struk yang diunggah" className="max-h-[75vh] w-full object-contain bg-slate-50" />
        ) : (
          <iframe src={fileUrl} title="Pratinjau PDF" className="h-[75vh] w-full" />
        )}
      </Card>
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Data struk</h2>
          {record.transactionId ? (
            <Link href={`/s/${spaceId}/transactions`}>
              <Badge color="green">Sudah diimpor</Badge>
            </Link>
          ) : record.reviewStatus === "APPROVED" ? (
            <Badge color="green">Disetujui — siap diimpor</Badge>
          ) : (
            <Badge color="amber">Perlu diperiksa</Badge>
          )}
        </div>
        {record.duplicates.length > 0 && !record.transactionId && (
          <p className="mb-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Mirip transaksi yang ada: {record.duplicates.map((x) => `${x.description ?? "-"} (${formatDate(x.date)})`).join("; ")}
          </p>
        )}
        <fieldset disabled={locked} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Merchant / toko" error={warn("merchant")}>
              <Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
            </Field>
            <Field label="Tanggal" error={warn("date")}>
              <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Total dibayar" error={warn("amount")} hint={items.length ? `Jumlah item: Rp ${itemsTotal.toLocaleString("id-ID")}` : undefined}>
              <MoneyInput required value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            </Field>
            <Field label="Metode pembayaran">
              <Input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="Tunai, debit, QRIS..." />
            </Field>
            <Field label="Akun pembayaran">
              <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Pakai akun default dokumen</option>
                {accounts.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kategori" hint={n.categoryId ? "Saran otomatis — silakan ubah bila perlu" : undefined}>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Tanpa kategori</option>
                {categories.filter((c) => c.type === "EXPENSE" && c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Keterangan transaksi">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={form.merchant ? `Belanja di ${form.merchant}` : ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="No. struk">
              <Input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} />
            </Field>
            <Field label="Subtotal">
              <MoneyInput value={form.subtotal} onChange={(v) => setForm({ ...form, subtotal: v })} />
            </Field>
            <Field label="Diskon">
              <MoneyInput value={form.discount} onChange={(v) => setForm({ ...form, discount: v })} />
            </Field>
            <Field label="Pajak">
              <MoneyInput value={form.tax} onChange={(v) => setForm({ ...form, tax: v })} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className={cn("text-sm font-medium", low.has("items") && "text-rose-600")}>Rincian item {low.has("items") && "(periksa)"}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setItems([...items, { itemName: "", quantity: "1", unitPrice: "", lineTotal: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Item
              </Button>
            </div>
            {items.length === 0 && <p className="text-xs text-slate-500">Tidak ada item. Rincian item bersifat opsional — transaksi disimpan sebagai satu total.</p>}
            <div className="space-y-2">
              {items.map((it, idx) => {
                const update = (patch: Partial<ItemRow>) => {
                  const next = { ...it, ...patch };
                  if (("quantity" in patch || "unitPrice" in patch) && next.quantity && next.unitPrice) next.lineTotal = String(Number(next.quantity) * Number(next.unitPrice));
                  setItems(items.map((x, i) => (i === idx ? next : x)));
                };
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-100 p-2">
                    <Input className="col-span-12" placeholder="Nama item" value={it.itemName} onChange={(e) => update({ itemName: e.target.value })} />
                    <Input className="col-span-3 tabular-nums" aria-label="Jumlah" type="number" step="0.001" min="0.001" placeholder="Qty" value={it.quantity} onChange={(e) => update({ quantity: e.target.value })} />
                    <Input className="col-span-4 tabular-nums" aria-label="Harga satuan" type="number" min="0" placeholder="Harga" value={it.unitPrice} onChange={(e) => update({ unitPrice: e.target.value })} />
                    <Input className="col-span-4 tabular-nums" aria-label="Total baris" type="number" min="0" placeholder="Total" value={it.lineTotal} onChange={(e) => update({ lineTotal: e.target.value })} />
                    <button type="button" className="col-span-1 text-slate-400 hover:text-rose-600" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Hapus item">
                      <Trash2 className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </fieldset>
        {!locked && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {record.reviewStatus !== "IGNORED" && (
              <Button variant="ghost" onClick={() => onPatch(record, { reviewStatus: "IGNORED" })}>
                Abaikan
              </Button>
            )}
            <Button variant="secondary" loading={saving} onClick={() => save(false)}>
              Simpan draf
            </Button>
            <Button loading={saving} disabled={!form.date || !form.amount} onClick={() => save(true)}>
              Simpan & setujui
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
