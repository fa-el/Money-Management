"use client";

import { Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Money, MoneyInput, PageHeader, ProgressBar, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { dateOnly, formatDate, today } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { Goal } from "@/lib/types";

const STATUS = { ACTIVE: ["Aktif", "blue"], COMPLETED: ["Tercapai", "green"], CANCELLED: ["Dibatalkan", "slate"] } as const;

export default function GoalsPage() {
  const { space, accounts, can } = useSpace();
  const toast = useToast();
  const list = useFetch(() => api.get<Goal[]>(`/finance-spaces/${space.id}/savings-goals`), [space.id]);
  const [goalForm, setGoalForm] = useState<{ open: boolean; goal: Goal | null; name: string; targetAmount: string; targetDate: string; status: Goal["status"] }>({
    open: false, goal: null, name: "", targetAmount: "", targetDate: "", status: "ACTIVE",
  });
  const [contrib, setContrib] = useState<{ goal: Goal | null; accountId: string; amount: string; contributionDate: string }>({ goal: null, accountId: "", amount: "", contributionDate: today() });
  const [saving, setSaving] = useState(false);

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: goalForm.name, targetAmount: goalForm.targetAmount, targetDate: goalForm.targetDate || null };
      if (goalForm.goal) await api.patch(`/finance-spaces/${space.id}/savings-goals/${goalForm.goal.id}`, { ...body, status: goalForm.status });
      else await api.post(`/finance-spaces/${space.id}/savings-goals`, body);
      toast.success("Target disimpan");
      setGoalForm({ ...goalForm, open: false });
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = async () => {
    if (!goalForm.goal || !confirm("Hapus target tabungan ini?")) return;
    await api.del(`/finance-spaces/${space.id}/savings-goals/${goalForm.goal.id}`).catch((e) => toast.error(errorMessage(e)));
    setGoalForm({ ...goalForm, open: false });
    void list.reload();
  };

  const saveContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/finance-spaces/${space.id}/savings-goals/${contrib.goal!.id}/contributions`, {
        accountId: contrib.accountId,
        amount: contrib.amount,
        contributionDate: contrib.contributionDate,
      });
      toast.success("Kontribusi dicatat");
      setContrib({ ...contrib, goal: null });
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeContribution = async (goalId: string, id: string) => {
    if (!confirm("Hapus kontribusi ini?")) return;
    await api.del(`/finance-spaces/${space.id}/savings-goals/${goalId}/contributions/${id}`).catch((e) => toast.error(errorMessage(e)));
    void list.reload();
  };

  return (
    <>
      <PageHeader
        title="Target Tabungan"
        description="Tetapkan target dan catat kontribusi. Kontribusi menandai dana untuk target — catat juga sebagai Transfer bila uangnya dipindahkan ke rekening lain."
        actions={
          can("EDITOR") && (
            <Button onClick={() => setGoalForm({ open: true, goal: null, name: "", targetAmount: "", targetDate: "", status: "ACTIVE" })}>
              <Plus className="h-4 w-4" /> Target baru
            </Button>
          )
        }
      />
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data?.length === 0 && (
        <Card>
          <EmptyState icon={<Target className="h-6 w-6" />} title="Belum ada target tabungan" description="Contoh: Dana darurat, liburan, DP rumah." />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {list.data?.map((g) => (
          <Card key={g.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{g.name}</p>
                <p className="text-xs text-slate-500">{g.targetDate ? `Target ${formatDate(g.targetDate)}` : "Tanpa tenggat"}</p>
              </div>
              <Badge color={STATUS[g.status][1]}>{STATUS[g.status][0]}</Badge>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              <Money value={g.savedAmount} className="text-xl font-semibold text-slate-900" /> / <Money value={g.targetAmount} />
            </p>
            <div className="mt-2">
              <ProgressBar value={g.progress} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {g.progress}% · kurang <Money value={g.remainingAmount} />
            </p>
            {g.contributions.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-600">Riwayat kontribusi ({g.contributions.length})</summary>
                <ul className="mt-2 space-y-1">
                  {g.contributions.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span>
                        {formatDate(c.contributionDate)} · {c.accountName}
                      </span>
                      <span className="flex items-center gap-2">
                        <Money value={c.amount} />
                        {can("EDITOR") && (
                          <button onClick={() => removeContribution(g.id, c.id)} className="text-slate-400 hover:text-rose-600" aria-label="Hapus kontribusi">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-4 flex gap-2">
              {g.status === "ACTIVE" && can("MEMBER") && (
                <Button size="sm" onClick={() => setContrib({ goal: g, accountId: accounts.find((a) => a.isActive)?.id ?? "", amount: "", contributionDate: today() })}>
                  Tambah kontribusi
                </Button>
              )}
              {can("EDITOR") && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setGoalForm({ open: true, goal: g, name: g.name, targetAmount: Number(g.targetAmount).toString(), targetDate: dateOnly(g.targetDate), status: g.status })}
                >
                  Ubah
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={goalForm.open}
        onClose={() => setGoalForm({ ...goalForm, open: false })}
        title={goalForm.goal ? "Ubah target" : "Target tabungan baru"}
        footer={
          <>
            {goalForm.goal && (
              <Button variant="ghost" className="mr-auto text-rose-600" onClick={deleteGoal}>
                Hapus
              </Button>
            )}
            <Button variant="secondary" onClick={() => setGoalForm({ ...goalForm, open: false })}>
              Batal
            </Button>
            <Button type="submit" form="goal-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="goal-form" onSubmit={saveGoal} className="space-y-4">
          <Field label="Nama target">
            <Input required value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="mis. Dana Darurat" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nominal target">
              <MoneyInput required value={goalForm.targetAmount} onChange={(v) => setGoalForm({ ...goalForm, targetAmount: v })} />
            </Field>
            <Field label="Tanggal target">
              <Input type="date" value={goalForm.targetDate} onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })} />
            </Field>
          </div>
          {goalForm.goal && (
            <Field label="Status">
              <Select value={goalForm.status} onChange={(e) => setGoalForm({ ...goalForm, status: e.target.value as Goal["status"] })}>
                <option value="ACTIVE">Aktif</option>
                <option value="COMPLETED">Tercapai</option>
                <option value="CANCELLED">Dibatalkan</option>
              </Select>
            </Field>
          )}
        </form>
      </Modal>

      <Modal
        open={!!contrib.goal}
        onClose={() => setContrib({ ...contrib, goal: null })}
        title={`Kontribusi: ${contrib.goal?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setContrib({ ...contrib, goal: null })}>
              Batal
            </Button>
            <Button type="submit" form="contrib-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="contrib-form" onSubmit={saveContribution} className="space-y-4">
          <Field label="Nominal">
            <MoneyInput required autoFocus value={contrib.amount} onChange={(v) => setContrib({ ...contrib, amount: v })} />
          </Field>
          <Field label="Sumber dana (akun)">
            <Select required value={contrib.accountId} onChange={(e) => setContrib({ ...contrib, accountId: e.target.value })}>
              <option value="">Pilih akun</option>
              {accounts
                .filter((a) => a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Tanggal">
            <Input type="date" required value={contrib.contributionDate} onChange={(e) => setContrib({ ...contrib, contributionDate: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
