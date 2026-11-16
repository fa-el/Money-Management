"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, fromDatetimeLocal, toDatetimeLocal } from "@/lib/format";
import type { Transaction, TxType } from "@/lib/types";
import { useSpace } from "./space-context";
import { useToast } from "./toast";
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, cn } from "./ui";

const TYPES: { value: TxType; label: string; icon: typeof ArrowUpRight; active: string }[] = [
  { value: "EXPENSE", label: "Pengeluaran", icon: ArrowUpRight, active: "bg-rose-600 text-white" },
  { value: "INCOME", label: "Pemasukan", icon: ArrowDownLeft, active: "bg-emerald-600 text-white" },
  { value: "TRANSFER", label: "Transfer", icon: ArrowLeftRight, active: "bg-sky-600 text-white" },
];

type FormProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  transaction?: Transaction | null;
  defaultType?: TxType;
};

/** Form dibuat ulang setiap kali dibuka sehingga state awal selalu segar. */
export function TransactionForm(props: FormProps) {
  if (!props.open) return null;
  return <TransactionFormBody key={props.transaction?.id ?? `new-${props.defaultType}`} {...props} />;
}

function TransactionFormBody({ open, onClose, onSaved, transaction, defaultType = "EXPENSE" }: FormProps) {
  const { space, accounts, categories, refresh } = useSpace();
  const toast = useToast();
  const editing = !!transaction;
  const [type, setType] = useState<TxType>(transaction?.type ?? defaultType);
  const [form, setForm] = useState(() =>
    transaction
      ? {
          accountId: transaction.accountId,
          destinationAccountId: transaction.destinationAccountId ?? "",
          categoryId: transaction.categoryId ?? "",
          amount: Number(transaction.amount).toString(),
          date: toDatetimeLocal(transaction.transactionDate),
          description: transaction.description ?? "",
        }
      : { accountId: accounts.find((a) => a.isActive)?.id ?? "", destinationAccountId: "", categoryId: "", amount: "", date: toDatetimeLocal(), description: "" },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAccounts = accounts.filter((a) => a.isActive || a.id === transaction?.accountId || a.id === transaction?.destinationAccountId);
  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === type && (c.isActive || c.id === transaction?.categoryId)),
    [categories, type, transaction],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.amount || Number(form.amount) <= 0) return setError("Nominal harus lebih besar dari nol");
    if (type === "TRANSFER" && form.accountId === form.destinationAccountId) return setError("Akun asal dan tujuan harus berbeda");
    if (type !== "TRANSFER" && !form.categoryId) return setError("Pilih kategori");
    setSaving(true);
    const body = {
      type,
      accountId: form.accountId,
      destinationAccountId: type === "TRANSFER" ? form.destinationAccountId : null,
      categoryId: type === "TRANSFER" ? null : form.categoryId,
      amount: form.amount,
      transactionDate: fromDatetimeLocal(form.date),
      description: form.description,
    };
    try {
      if (editing) await api.patch(`/finance-spaces/${space.id}/transactions/${transaction!.id}`, body);
      else await api.post(`/finance-spaces/${space.id}/transactions`, body);
      toast.success(editing ? "Transaksi diperbarui" : "Transaksi disimpan");
      void refresh();
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const balanceOf = (id: string) => accounts.find((a) => a.id === id)?.balance;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Ubah transaksi" : "Catat transaksi"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form="tx-form" loading={saving}>
            Simpan
          </Button>
        </>
      }
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-slate-600">Buat akun terlebih dahulu di menu Akun sebelum mencatat transaksi.</p>
      ) : (
        <form id="tx-form" onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => {
                  setType(t.value);
                  setForm((f) => ({ ...f, categoryId: "" }));
                }}
                className={cn("flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition", type === t.value ? t.active : "text-slate-600 hover:bg-white")}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <Field label="Nominal">
            <MoneyInput autoFocus required value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0" />
          </Field>

          <div className={cn("grid gap-4", type === "TRANSFER" && "sm:grid-cols-2")}>
            <Field label={type === "TRANSFER" ? "Dari akun" : "Akun"} hint={form.accountId ? `Saldo: ${formatMoney(balanceOf(form.accountId))}` : undefined}>
              <Select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Pilih akun</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {type === "TRANSFER" && (
              <Field label="Ke akun" hint={form.destinationAccountId ? `Saldo: ${formatMoney(balanceOf(form.destinationAccountId))}` : undefined}>
                <Select required value={form.destinationAccountId} onChange={(e) => setForm({ ...form, destinationAccountId: e.target.value })}>
                  <option value="">Pilih akun tujuan</option>
                  {activeAccounts
                    .filter((a) => a.id !== form.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
          </div>

          {type !== "TRANSFER" && (
            <Field label="Kategori">
              <Select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Pilih kategori</option>
                {typeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Tanggal & waktu">
            <Input type="datetime-local" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Keterangan">
            <Textarea rows={2} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opsional" />
          </Field>
          {type === "TRANSFER" && <p className="text-xs text-slate-500">Transfer hanya memindahkan saldo antar-akun dan tidak dihitung sebagai pemasukan/pengeluaran.</p>}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
