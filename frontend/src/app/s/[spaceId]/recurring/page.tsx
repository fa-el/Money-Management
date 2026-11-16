"use client";

import { Play, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Money, MoneyInput, PageHeader, Select, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateOnly, formatDate, formatDateTime, today } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { FREQ_LABEL, TX_LABEL, type Recurring, type TxType } from "@/lib/types";

const empty = { type: "EXPENSE" as TxType, accountId: "", destinationAccountId: "", categoryId: "", amount: "", description: "", frequency: "MONTHLY" as Recurring["frequency"], startDate: today(), endDate: "" };

export default function RecurringPage() {
  const { space, accounts, categories, can, refresh } = useSpace();
  const toast = useToast();
  const list = useFetch(() => api.get<Recurring[]>(`/finance-spaces/${space.id}/recurring-transactions`), [space.id]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const canEdit = can("EDITOR");
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "-";
  const category = (id: string | null) => categories.find((c) => c.id === id);

  const openForm = (r?: Recurring) => {
    setEditing(r ?? null);
    setForm(
      r
        ? {
            type: r.type,
            accountId: r.accountId,
            destinationAccountId: r.destinationAccountId ?? "",
            categoryId: r.categoryId ?? "",
            amount: Number(r.amount).toString(),
            description: r.description ?? "",
            frequency: r.frequency,
            startDate: dateOnly(r.startDate),
            endDate: dateOnly(r.endDate),
          }
        : { ...empty, accountId: accounts.find((a) => a.isActive)?.id ?? "" },
    );
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/finance-spaces/${space.id}/recurring-transactions/${editing.id}`, {
          amount: form.amount,
          description: form.description,
          categoryId: form.type === "TRANSFER" ? undefined : form.categoryId || null,
          endDate: form.endDate || null,
        });
      } else {
        await api.post(`/finance-spaces/${space.id}/recurring-transactions`, {
          ...form,
          destinationAccountId: form.type === "TRANSFER" ? form.destinationAccountId : null,
          categoryId: form.type === "TRANSFER" ? null : form.categoryId || null,
          endDate: form.endDate || null,
        });
      }
      toast.success("Jadwal disimpan. Transaksi yang sudah jatuh tempo dibuat otomatis.");
      setOpen(false);
      void list.reload();
      void refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: Recurring) => {
    await api.patch(`/finance-spaces/${space.id}/recurring-transactions/${r.id}`, { isActive: !r.isActive }).catch((e) => toast.error(errorMessage(e)));
    void list.reload();
  };

  const run = async (r: Recurring) => {
    try {
      const res = await api.post<{ created: number }>(`/finance-spaces/${space.id}/recurring-transactions/${r.id}/run`);
      toast.success(res.created ? `${res.created} transaksi dibuat` : "Tidak ada jadwal yang jatuh tempo");
      void list.reload();
      void refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    if (!editing || !confirm("Hapus jadwal ini? Transaksi yang sudah dibuat tetap tersimpan.")) return;
    await api.del(`/finance-spaces/${space.id}/recurring-transactions/${editing.id}`).catch((e) => toast.error(errorMessage(e)));
    setOpen(false);
    void list.reload();
  };

  return (
    <>
      <PageHeader
        title="Transaksi Berulang"
        description="Jadwal otomatis untuk gaji, tagihan, cicilan, dsb. Diproses setiap hari pukul 00:05 WIB."
        actions={
          canEdit && (
            <Button onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Jadwal baru
            </Button>
          )
        }
      />
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data?.length === 0 && (
        <Card>
          <EmptyState icon={<Repeat className="h-6 w-6" />} title="Belum ada transaksi berulang" />
        </Card>
      )}
      {list.data && list.data.length > 0 && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {list.data.map((r) => {
              const cat = category(r.categoryId);
              return (
                <li key={r.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-4", !r.isActive && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.description || cat?.name || TX_LABEL[r.type]}
                      <Badge color={r.type === "INCOME" ? "green" : r.type === "EXPENSE" ? "red" : "blue"}>{TX_LABEL[r.type]}</Badge>
                      <Badge>{FREQ_LABEL[r.frequency]}</Badge>
                      {!r.isActive && <Badge>Nonaktif</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.type === "TRANSFER" ? `${accountName(r.accountId)} → ${accountName(r.destinationAccountId)}` : `${cat ? `${cat.icon} ${cat.name} · ` : ""}${accountName(r.accountId)}`}
                      {" · "}berikutnya {formatDate(r.nextExecutionDate)}
                      {r.endDate && ` · s.d. ${formatDate(r.endDate)}`}
                      {r.lastExecutionAt && ` · terakhir ${formatDateTime(r.lastExecutionAt)}`}
                    </p>
                  </div>
                  <Money value={r.amount} type={r.type} className="font-semibold" />
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => run(r)} title="Proses jadwal jatuh tempo sekarang">
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                        {r.isActive ? "Jeda" : "Aktifkan"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openForm(r)}>
                        Ubah
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Ubah jadwal" : "Jadwal transaksi berulang"}
        footer={
          <>
            {editing && (
              <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}>
                Hapus
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" form="rec-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="rec-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis">
              <Select disabled={!!editing} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TxType, categoryId: "" })}>
                {Object.entries(TX_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nominal">
              <MoneyInput required value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            </Field>
            <Field label={form.type === "TRANSFER" ? "Dari akun" : "Akun"}>
              <Select required disabled={!!editing} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Pilih akun</option>
                {accounts.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {form.type === "TRANSFER" ? (
              <Field label="Ke akun">
                <Select required disabled={!!editing} value={form.destinationAccountId} onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value })}>
                  <option value="">Pilih akun</option>
                  {accounts.filter((a) => a.isActive && a.id !== form.accountId).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Kategori">
                <Select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Pilih kategori</option>
                  {categories.filter((c) => c.type === form.type && c.isActive).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Frekuensi">
              <Select disabled={!!editing} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Recurring["frequency"] })}>
                {Object.entries(FREQ_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mulai tanggal">
              <Input type="date" required disabled={!!editing} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="Berakhir (opsional)">
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
            <Field label="Keterangan">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="mis. Gaji bulanan" />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
