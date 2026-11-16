"use client";

import { Briefcase, Home, Mail, Plus, User, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopBar } from "@/components/top-bar";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Select, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { ROLE_LABEL, SPACE_LABEL, type Role, type Space, type SpaceType } from "@/lib/types";

const ICON = { PERSONAL: User, FAMILY: Home, BUSINESS: Briefcase } as const;
const DESC: Record<SpaceType, string> = {
  PERSONAL: "Keuangan individu: gaji, belanja, tabungan, cicilan.",
  FAMILY: "Keuangan bersama keluarga dengan anggota & role.",
  BUSINESS: "Kas usaha sederhana: penjualan, modal, biaya operasional.",
};

interface Invitation {
  id: string;
  role: Role;
  financeSpace: { id: string; name: string; type: SpaceType };
}

export default function SpacesPage() {
  const router = useRouter();
  const toast = useToast();
  const spaces = useFetch(() => api.get<Space[]>("/finance-spaces"), []);
  const invites = useFetch(() => api.get<Invitation[]>("/invitations"), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; type: SpaceType; currency: string }>({ name: "", type: "PERSONAL", currency: "IDR" });
  const [saving, setSaving] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await api.post<Space>("/finance-spaces", form);
      toast.success("Ruang keuangan dibuat beserta kategori bawaan");
      router.push(`/s/${s.id}/accounts?onboarding=1`);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  const respond = async (id: string, accept: boolean) => {
    try {
      await api.post(`/invitations/${id}/${accept ? "accept" : "decline"}`);
      toast.success(accept ? "Anda bergabung ke ruang" : "Undangan ditolak");
      void invites.reload();
      void spaces.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ruang Keuangan</h1>
            <p className="mt-1 text-sm text-slate-500">Setiap ruang memiliki akun, kategori, transaksi, dan anggota yang terpisah.</p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Ruang baru
          </Button>
        </div>

        {invites.data && invites.data.length > 0 && (
          <Card className="mb-6 border-emerald-200 bg-emerald-50/50 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <Mail className="h-4 w-4" /> Undangan menunggu
            </p>
            <div className="space-y-2">
              {invites.data.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-100">
                  <span className="text-sm">
                    <b>{inv.financeSpace.name}</b> ({SPACE_LABEL[inv.financeSpace.type]}) sebagai {ROLE_LABEL[inv.role]}
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => respond(inv.id, false)}>
                      Tolak
                    </Button>
                    <Button size="sm" onClick={() => respond(inv.id, true)}>
                      Terima
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {spaces.loading && !spaces.data ? (
          <Loading />
        ) : spaces.error ? (
          <ErrorState message={spaces.error} onRetry={spaces.reload} />
        ) : spaces.data!.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Plus className="h-6 w-6" />}
              title="Belum ada ruang keuangan"
              description="Mulai dengan membuat ruang Pribadi, Keluarga, atau Bisnis."
              action={<Button onClick={() => setOpen(true)}>Buat ruang pertama</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.data!.map((s) => {
              const Icon = ICON[s.type];
              return (
                <Link key={s.id} href={`/s/${s.id}`}>
                  <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg",
                          s.type === "PERSONAL" ? "bg-emerald-100 text-emerald-700" : s.type === "FAMILY" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <Badge>{ROLE_LABEL[s.role]}</Badge>
                    </div>
                    <p className="mt-4 font-semibold text-slate-900">{s.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      {SPACE_LABEL[s.type]} · {s.currency}
                      {s.type !== "PERSONAL" && (
                        <>
                          {" "}
                          · <Users className="h-3 w-3" /> {s.memberCount} anggota
                        </>
                      )}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Buat ruang keuangan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button form="space-form" type="submit" loading={saving}>
              Buat ruang
            </Button>
          </>
        }
      >
        <form id="space-form" onSubmit={create} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(ICON) as SpaceType[]).map((t) => {
              const Icon = ICON[t];
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    form.type === t ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <Icon className="h-5 w-5 text-slate-600" />
                  <p className="mt-2 text-sm font-medium">{SPACE_LABEL[t]}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{DESC[t]}</p>
                </button>
              );
            })}
          </div>
          <Field label="Nama ruang">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Keuangan Rumah Tangga" />
          </Field>
          <Field label="Mata uang" hint="Versi ini berfokus pada Rupiah (IDR).">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="IDR">IDR — Rupiah</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </>
  );
}
