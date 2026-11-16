"use client";

import { AlertTriangle, PiggyBank, Plus } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Money, MoneyInput, PageHeader, ProgressBar, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateOnly, formatDate, monthRange } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { Budget } from "@/lib/types";

const PERIOD_LABEL = { WEEKLY: "Mingguan", MONTHLY: "Bulanan", YEARLY: "Tahunan" } as const;

export default function BudgetsPage() {
  const { space, categories, can } = useSpace();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const list = useFetch(() => api.get<Budget[]>(`/finance-spaces/${space.id}/budgets`, showAll ? {} : { activeOn: new Date().toISOString().slice(0, 10) }), [space.id, showAll]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState({ categoryId: "", period: "MONTHLY" as Budget["period"], startDate: monthRange(0).from, endDate: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const canEdit = can("EDITOR");

  const openForm = (b?: Budget) => {
    setEditing(b ?? null);
    setForm(
      b
        ? { categoryId: b.categoryId, period: b.period, startDate: dateOnly(b.startDate), endDate: dateOnly(b.endDate), amount: Number(b.amount).toString() }
        : { categoryId: "", period: "MONTHLY", startDate: monthRange(0).from, endDate: "", amount: "" },
    );
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.patch(`/finance-spaces/${space.id}/budgets/${editing.id}`, { startDate: form.startDate, endDate: form.endDate, amount: form.amount });
      else await api.post(`/finance-spaces/${space.id}/budgets`, { ...form, endDate: form.endDate || undefined });
      toast.success("Anggaran disimpan");
      setOpen(false);
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirm("Hapus anggaran ini?")) return;
    try {
      await api.del(`/finance-spaces/${space.id}/budgets/${editing.id}`);
      setOpen(false);
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const totals = (list.data ?? []).reduce((s, b) => ({ amount: s.amount + Number(b.amount), spent: s.spent + Number(b.spent) }), { amount: 0, spent: 0 });

  return (
    <>
      <PageHeader
        title="Anggaran"
        description="Batas pengeluaran per kategori dan periode. Notifikasi dikirim saat pemakaian mencapai 80% dan 100%."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Hanya yang aktif" : "Tampilkan semua"}
            </Button>
            {canEdit && (
              <Button onClick={() => openForm()}>
                <Plus className="h-4 w-4" /> Anggaran baru
              </Button>
            )}
          </>
        }
      />
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data && list.data.length === 0 && (
        <Card>
          <EmptyState icon={<PiggyBank className="h-6 w-6" />} title="Belum ada anggaran" description="Buat anggaran untuk kategori pengeluaran agar pengeluaran lebih terkendali." action={canEdit && <Button onClick={() => openForm()}>Buat anggaran</Button>} />
        </Card>
      )}
      {list.data && list.data.length > 0 && (
        <>
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-600">
                Terpakai <Money value={totals.spent} className="font-semibold text-slate-900" /> dari <Money value={totals.amount} className="font-semibold text-slate-900" />
              </span>
              <span className="text-slate-500">
                Sisa <Money value={totals.amount - totals.spent} className="font-semibold" />
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={totals.amount ? (totals.spent / totals.amount) * 100 : 0} status={totals.spent > totals.amount ? "OVER" : totals.spent >= totals.amount * 0.8 ? "WARNING" : "OK"} />
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {list.data.map((b) => (
              <Card key={b.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {b.category.icon} {b.category.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {PERIOD_LABEL[b.period]} · {formatDate(b.startDate)} – {formatDate(b.endDate)}
                    </p>
                  </div>
                  {b.status === "OVER" ? (
                    <Badge color="red">
                      <AlertTriangle className="h-3 w-3" /> Terlampaui
                    </Badge>
                  ) : b.status === "WARNING" ? (
                    <Badge color="amber">
                      <AlertTriangle className="h-3 w-3" /> Hampir habis
                    </Badge>
                  ) : (
                    <Badge color="green">Aman</Badge>
                  )}
                </div>
                <div className="mt-4">
                  <ProgressBar value={b.usage} status={b.status} />
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-slate-600">
                    <Money value={b.spent} /> / <Money value={b.amount} /> ({b.usage}%)
                  </span>
                  <span className={Number(b.remaining) < 0 ? "font-medium text-rose-600" : "text-slate-600"}>
                    {Number(b.remaining) < 0 ? "Lebih " : "Sisa "}
                    <Money value={Math.abs(Number(b.remaining))} />
                  </span>
                </div>
                {canEdit && (
                  <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => openForm(b)}>
                    Ubah
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Ubah anggaran" : "Anggaran baru"}
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
            <Button type="submit" form="budget-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="budget-form" onSubmit={save} className="space-y-4">
          <Field label="Kategori pengeluaran">
            <Select required disabled={!!editing} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Pilih kategori</option>
              {categories
                .filter((c) => c.type === "EXPENSE" && c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Periode">
              <Select disabled={!!editing} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as Budget["period"] })}>
                {Object.entries(PERIOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nominal batas">
              <MoneyInput required value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            </Field>
            <Field label="Tanggal mulai">
              <Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="Tanggal akhir" hint={editing ? undefined : "Kosongkan untuk otomatis sesuai periode"}>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
