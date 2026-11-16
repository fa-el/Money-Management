"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/login", { email, password });
      const next = new URLSearchParams(window.location.search).get("next");
      // Hanya izinkan redirect internal
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/spaces";
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="mb-6 text-lg font-semibold">Masuk ke akun Anda</h2>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">
          Masuk
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-emerald-700 hover:underline">
          Daftar
        </Link>
      </p>
    </Card>
  );
}
