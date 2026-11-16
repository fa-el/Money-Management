"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Konfirmasi password tidak sama");
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/register", { name: form.name, email: form.email, password: form.password });
      window.location.href = "/spaces?welcome=1";
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="mb-6 text-lg font-semibold">Buat akun baru</h2>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama lengkap">
          <Input required minLength={2} value={form.name} onChange={set("name")} autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
        </Field>
        <Field label="Password" hint="Minimal 8 karakter">
          <Input type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Field label="Ulangi password">
          <Input type="password" required value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">
          Daftar
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Masuk
        </Link>
      </p>
    </Card>
  );
}
