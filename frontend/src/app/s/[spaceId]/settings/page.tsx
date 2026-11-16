"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Loading, PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import { SPACE_LABEL, type Paginated } from "@/lib/types";

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

const ACTION_LABEL: Record<string, string> = {
  "space.create": "Membuat ruang",
  "space.update": "Mengubah pengaturan ruang",
  "transaction.create": "Mencatat transaksi",
  "transaction.update": "Mengubah transaksi",
  "transaction.delete": "Menghapus transaksi",
  "transaction.void": "Membatalkan transaksi",
  "transaction.restore": "Mengaktifkan kembali transaksi",
  "transfer.create": "Mencatat transfer",
  "account.create": "Menambah akun",
  "account.update": "Mengubah akun",
  "account.delete": "Menghapus akun",
  "category.create": "Menambah kategori",
  "category.update": "Mengubah kategori",
  "category.delete": "Menghapus kategori",
  "member.invite": "Mengundang anggota",
  "member.join": "Bergabung ke ruang",
  "member.role_change": "Mengubah role anggota",
  "member.remove": "Mengeluarkan anggota",
  "member.leave": "Keluar dari ruang",
  "import.upload": "Mengunggah dokumen",
  "import.commit": "Mengimpor transaksi dari dokumen",
  "import.delete": "Menghapus dokumen sumber",
  "recurring.execute": "Transaksi berulang dijalankan",
  "budget.create": "Membuat anggaran",
  "goal.create": "Membuat target tabungan",
  "goal.contribute": "Menambah kontribusi tabungan",
};

export default function SettingsPage() {
  const { space, can } = useSpace();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [confirmName, setConfirmName] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const logs = useFetch(() => (can("ADMIN") ? api.get<Paginated<AuditLog>>(`/finance-spaces/${space.id}/audit-logs`, { page, pageSize: 20 }) : Promise.resolve(null)), [space.id, page]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/finance-spaces/${space.id}`, { name });
      toast.success("Pengaturan disimpan");
      window.location.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/finance-spaces/${space.id}`, { confirm: confirmName });
      toast.success("Ruang dihapus");
      router.push("/spaces");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Pengaturan ruang" description={`Ruang ${SPACE_LABEL[space.type]} · mata uang ${space.currency}`} />
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Informasi ruang</h2>
          <form onSubmit={save} className="max-w-md space-y-4">
            <Field label="Nama ruang">
              <Input required disabled={!can("ADMIN")} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Tipe ruang" hint="Tipe tidak dapat diubah setelah ruang dibuat.">
              <Input disabled value={SPACE_LABEL[space.type]} />
            </Field>
            {can("ADMIN") && (
              <Button type="submit" loading={saving}>
                Simpan
              </Button>
            )}
          </form>
        </Card>

        {can("ADMIN") && (
          <Card>
            <h2 className="px-5 pt-5 font-semibold">Jejak aktivitas (audit log)</h2>
            {!logs.data ? (
              <Loading />
            ) : (
              <>
                <ul className="mt-3 divide-y divide-slate-100">
                  {logs.data.data.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                      <span>
                        <span className="font-medium">{l.actorName ?? "Sistem"}</span> — {ACTION_LABEL[l.action] ?? l.action}{" "}
                        <Badge className="ml-1">{l.entityType}</Badge>
                      </span>
                      <span className="text-xs text-slate-500">{formatDateTime(l.createdAt)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Sebelumnya
                  </Button>
                  <Button size="sm" variant="secondary" disabled={page >= logs.data.meta.totalPages} onClick={() => setPage(page + 1)}>
                    Berikutnya
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}

        {space.role === "OWNER" && (
          <Card className="border-rose-200 p-5">
            <h2 className="font-semibold text-rose-700">Hapus ruang</h2>
            <p className="mt-1 text-sm text-slate-600">Ruang akan disembunyikan dari semua anggota (soft delete; data tetap tersimpan untuk jejak audit). Ketik nama ruang untuk konfirmasi.</p>
            <div className="mt-3 flex max-w-md gap-2">
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={space.name} />
              <Button variant="danger" disabled={confirmName !== space.name} onClick={remove}>
                Hapus
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
