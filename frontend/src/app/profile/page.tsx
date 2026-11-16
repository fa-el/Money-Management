"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/top-bar";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState<"profile" | "password" | null>(null);

  useEffect(() => {
    api.get<User>("/auth/me").then((u) => {
      setUser(u);
      setName(u.name);
    });
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving("profile");
    try {
      setUser(await api.patch<User>("/auth/me", { name }));
      toast.success("Profil diperbarui");
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setSaving(null);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast.error("Konfirmasi password tidak sama");
    setSaving("password");
    try {
      await api.patch("/auth/password", { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success("Password diubah. Sesi di perangkat lain telah dikeluarkan.");
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setSaving(null);
  };

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Profil & Keamanan</h1>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Profil</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Email">
              <Input value={user?.email ?? ""} disabled />
            </Field>
            <Field label="Nama">
              <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" loading={saving === "profile"}>
              Simpan profil
            </Button>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Ubah password</h2>
          <form onSubmit={savePassword} className="space-y-4">
            <Field label="Password saat ini">
              <Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="Password baru" hint="Minimal 8 karakter">
              <Input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Ulangi password baru">
              <Input type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            </Field>
            <Button type="submit" loading={saving === "password"}>
              Ubah password
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
