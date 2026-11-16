"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Tabs } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Category } from "@/lib/types";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#64748b"];
const ICONS = ["🍽️", "🛒", "🚗", "🏠", "💡", "🎬", "💊", "🎓", "🏦", "🧾", "💼", "🎁", "💰", "📦", "✈️", "👕", "🐾", "📱", "☕", "⚙️"];

export default function CategoriesPage() {
  const { space, categories, can, refresh } = useSpace();
  const toast = useToast();
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "🛒", color: COLORS[0], isActive: true });
  const [saving, setSaving] = useState(false);
  const canEdit = can("EDITOR");

  const openForm = (c?: Category) => {
    setEditing(c ?? null);
    setForm(c ? { name: c.name, icon: c.icon ?? "", color: c.color ?? COLORS[0], isActive: c.isActive } : { name: "", icon: "🛒", color: COLORS[0], isActive: true });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.patch(`/finance-spaces/${space.id}/categories/${editing.id}`, form);
      else await api.post(`/finance-spaces/${space.id}/categories`, { name: form.name, icon: form.icon, color: form.color, type });
      toast.success("Kategori disimpan");
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirm(`Hapus kategori "${editing.name}"?`)) return;
    try {
      await api.del(`/finance-spaces/${space.id}/categories/${editing.id}`);
      toast.success("Kategori dihapus");
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const list = categories.filter((c) => c.type === type);

  return (
    <>
      <PageHeader
        title="Kategori"
        description="Kelompokkan pemasukan dan pengeluaran. Kategori bawaan dapat diubah sesuai kebutuhan."
        actions={
          canEdit && (
            <Button onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Kategori {type === "EXPENSE" ? "pengeluaran" : "pemasukan"}
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Tabs
          value={type}
          onChange={setType}
          options={[
            { value: "EXPENSE", label: "Pengeluaran" },
            { value: "INCOME", label: "Pemasukan" },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <Card key={c.id} className={`flex items-center gap-3 p-4 ${c.isActive ? "" : "opacity-60"}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg text-lg" style={{ background: `${c.color ?? "#94a3b8"}22` }}>
              {c.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.name}</span>
              {!c.isActive && <Badge>Nonaktif</Badge>}
            </span>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => openForm(c)}>
                Ubah
              </Button>
            )}
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-slate-500">Belum ada kategori.</p>}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Ubah kategori" : `Kategori ${type === "EXPENSE" ? "pengeluaran" : "pemasukan"} baru`}
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
            <Button type="submit" form="cat-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="cat-form" onSubmit={save} className="space-y-4">
          <Field label="Nama">
            <Input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Ikon">
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button type="button" key={i} onClick={() => setForm({ ...form, icon: i })} className={`h-9 w-9 rounded-lg text-lg ${form.icon === i ? "bg-emerald-100 ring-2 ring-emerald-500" : "bg-slate-100 hover:bg-slate-200"}`}>
                  {i}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Warna">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button type="button" key={c} aria-label={c} onClick={() => setForm({ ...form, color: c })} className={`h-7 w-7 rounded-full ${form.color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" /> Kategori aktif
            </label>
          )}
        </form>
      </Modal>
    </>
  );
}
