"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ErrorState, Field, Input, Loading, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { ROLE_LABEL, ROLE_LEVEL, type Member, type Role } from "@/lib/types";

const ROLE_DESC: Record<Role, string> = {
  OWNER: "Akses penuh termasuk menghapus ruang dan mengalihkan kepemilikan.",
  ADMIN: "Mengelola anggota & seluruh data operasional.",
  EDITOR: "Membuat dan mengubah transaksi serta data operasional.",
  MEMBER: "Melihat data dan mencatat transaksi (hanya mengubah transaksinya sendiri).",
  VIEWER: "Hanya melihat dashboard, transaksi, dan laporan.",
};

export default function MembersPage() {
  const { space, can } = useSpace();
  const toast = useToast();
  const router = useRouter();
  const list = useFetch(() => api.get<{ data: Member[]; allowedRoles: Role[] }>(`/finance-spaces/${space.id}/members`), [space.id]);
  const [invite, setInvite] = useState({ open: false, email: "", role: "" as Role | "" });
  const [saving, setSaving] = useState(false);
  const isAdmin = can("ADMIN");
  const myLevel = ROLE_LEVEL[space.role];
  const assignable = (list.data?.allowedRoles ?? []).filter((r) => ROLE_LEVEL[r] < myLevel);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/finance-spaces/${space.id}/members`, { email: invite.email, role: invite.role });
      toast.success("Undangan terkirim. Pengguna akan melihatnya di notifikasi & daftar ruang.");
      setInvite({ open: false, email: "", role: "" });
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (m: Member, role: Role) => {
    try {
      await api.patch(`/finance-spaces/${space.id}/members/${m.id}/role`, { role });
      toast.success("Role diperbarui");
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const removeMember = async (m: Member) => {
    if (!confirm(m.status === "INVITED" ? `Batalkan undangan untuk ${m.user.email}?` : `Keluarkan ${m.user.name} dari ruang?`)) return;
    try {
      await api.del(`/finance-spaces/${space.id}/members/${m.id}`);
      void list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const transfer = async (m: Member) => {
    if (!confirm(`Alihkan kepemilikan ke ${m.user.name}? Role Anda akan menjadi Admin.`)) return;
    try {
      await api.post(`/finance-spaces/${space.id}/members/${m.id}/transfer-ownership`);
      toast.success("Kepemilikan dialihkan");
      window.location.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const leave = async () => {
    if (!confirm(`Keluar dari ruang "${space.name}"?`)) return;
    try {
      await api.del(`/finance-spaces/${space.id}/members/me`);
      router.push("/spaces");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Anggota"
        description="Kolaborasi dengan hak akses berbeda. Setiap permintaan diperiksa keanggotaan & role-nya."
        actions={
          <>
            {space.role !== "OWNER" && (
              <Button variant="secondary" onClick={leave}>
                Keluar dari ruang
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setInvite({ open: true, email: "", role: assignable[assignable.length - 1] ?? "" })}>
                <UserPlus className="h-4 w-4" /> Undang anggota
              </Button>
            )}
          </>
        }
      />
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.data && list.loading && <Loading />}
      {list.data && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {list.data.data.map((m) => {
              const manageable = isAdmin && ROLE_LEVEL[m.role] < myLevel;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{m.user.name[0]?.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.user.name}
                      {m.status === "INVITED" && <Badge color="amber">Menunggu konfirmasi</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.user.email} · {m.joinedAt ? `bergabung ${formatDate(m.joinedAt)}` : `diundang ${formatDate(m.createdAt)}`}
                    </p>
                  </div>
                  {manageable && m.status === "ACTIVE" ? (
                    <Select className="w-auto" value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} aria-label="Ubah role">
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge color={m.role === "OWNER" ? "violet" : "slate"}>{ROLE_LABEL[m.role]}</Badge>
                  )}
                  {space.role === "OWNER" && m.status === "ACTIVE" && m.role !== "OWNER" && (
                    <Button size="sm" variant="ghost" onClick={() => transfer(m)}>
                      Jadikan pemilik
                    </Button>
                  )}
                  {manageable && (
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => removeMember(m)}>
                      {m.status === "INVITED" ? "Batalkan" : "Keluarkan"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-semibold">Hak akses role</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {(list.data?.allowedRoles ? (["OWNER", ...list.data.allowedRoles] as Role[]) : []).map((r) => (
            <div key={r} className="rounded-lg bg-slate-50 p-3">
              <dt className="font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="text-slate-600">{ROLE_DESC[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Modal
        open={invite.open}
        onClose={() => setInvite({ ...invite, open: false })}
        title="Undang anggota"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvite({ ...invite, open: false })}>
              Batal
            </Button>
            <Button type="submit" form="invite-form" loading={saving}>
              Kirim undangan
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={sendInvite} className="space-y-4">
          <Field label="Email pengguna" hint="Pengguna harus sudah terdaftar di aplikasi.">
            <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </Field>
          <Field label="Role" hint={invite.role ? ROLE_DESC[invite.role] : undefined}>
            <Select required value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </>
  );
}
