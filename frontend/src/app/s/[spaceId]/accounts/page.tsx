"use client";

import { Banknote, Building2, Plus, Smartphone, Wallet } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Money, MoneyInput, PageHeader, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateOnly, formatDate, today } from "@/lib/format";
import { ACCOUNT_LABEL, type Account } from "@/lib/types";

const ICONS = { BANK: Building2, CASH: Banknote, EWALLET: Smartphone } as const;
type FormState = { name: string; type: Account["type"]; openingBalance: string; openingBalanceDate: string; isActive: boolean };

export default function AccountsPage() {
  const { space, accounts, totalBalance, can, refresh } = useSpace();
  const toast = useToast();
  const [editing, setEditing] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ name: "", type: "BANK", openingBalance: "0", openingBalanceDate: today(), isActive: true });
  const [saving, setSaving] = useState(false);
  const canEdit = can("EDITOR");

  const openForm = (a?: Account) => {
    setEditing(a ?? null);
    setForm(
      a
        ? { name: a.name, type: a.type, openingBalance: Number(a.openingBalance).toString(), openingBalanceDate: dateOnly(a.openingBalanceDate), isActive: a.isActive }
        : { name: "", type: "BANK", openingBalance: "0", openingBalanceDate: today(), isActive: true },
    );
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, openingBalance: form.openingBalance || "0" };
      if (editing) await api.patch(`/finance-spaces/${space.id}/accounts/${editing.id}`, body);
      else {
        await api.post(`/finance-spaces/${space.id}/accounts`, { name: body.name, type: body.type, openingBalance: body.openingBalance, openingBalanceDate: body.openingBalanceDate });
      }
      toast.success(editing ? "Akun diperbarui" : "Akun ditambahkan");
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirm(`Hapus akun "${editing.name}"?`)) return;
    try {
      await api.del(`/finance-spaces/${space.id}/accounts/${editing.id}`);
      toast.success("Akun dihapus");
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Akun"
        description={
          <>
            Rekening, kas, dan dompet digital. Total saldo akun aktif: <Money value={totalBalance} currency={space.currency} className="font-semibold text-slate-800" />
          </>
        }
        actions={
          canEdit && (
            <Button onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Tambah akun
            </Button>
          )
        }
      />
      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="Belum ada akun"
            description="Tambahkan rekening bank, kas tunai, atau dompet digital beserta saldo awalnya."
            action={canEdit && <Button onClick={() => openForm()}>Tambah akun pertama</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const Icon = ICONS[a.type];
            return (
              <Card key={a.id} className={`p-5 ${a.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  {!a.isActive && <Badge>Nonaktif</Badge>}
                </div>
                <p className="mt-3 font-semibold">{a.name}</p>
                <p className="text-xs text-slate-500">{ACCOUNT_LABEL[a.type]}</p>
                <p className="mt-3 text-xl font-semibold">
                  <Money value={a.balance} currency={space.currency} />
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Saldo awal <Money value={a.openingBalance} currency={space.currency} /> per {formatDate(a.openingBalanceDate)} · {a.transactionCount} transaksi
                </p>
                {canEdit && (
                  <Button size="sm" variant="secondary" className="mt-4" onClick={() => openForm(a)}>
                    Ubah
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Ubah akun" : "Tambah akun"}
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
            <Button type="submit" form="account-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="account-form" onSubmit={save} className="space-y-4">
          <Field label="Nama akun">
            <Input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Rekening BCA" />
          </Field>
          <Field label="Jenis">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })}>
              {Object.entries(ACCOUNT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Saldo awal" hint="Boleh negatif untuk utang/kartu kredit">
              <MoneyInput allowNegative value={form.openingBalance} onChange={(v) => setForm({ ...form, openingBalance: v })} />
            </Field>
            <Field label="Per tanggal" hint="Transaksi tidak boleh sebelum tanggal ini">
              <Input type="date" required value={form.openingBalanceDate} onChange={(e) => setForm({ ...form, openingBalanceDate: e.target.value })} />
            </Field>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Akun aktif (akun nonaktif tidak dihitung dalam total saldo dan tidak bisa dipakai transaksi baru)
            </label>
          )}
        </form>
      </Modal>
    </>
  );
}
