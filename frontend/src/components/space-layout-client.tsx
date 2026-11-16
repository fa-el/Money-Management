"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SpaceProvider } from "@/components/space-context";
import { Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Space } from "@/lib/types";

export function SpaceLayoutClient({ children }: { children: React.ReactNode }) {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Space>(`/finance-spaces/${spaceId}`)
      .then(setSpace)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "Ruang keuangan tidak ditemukan atau Anda bukan anggota." : e.message));
  }, [spaceId]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-slate-700">{error}</p>
        <Link href="/spaces" className="text-sm font-medium text-emerald-700 hover:underline">
          Kembali ke daftar ruang
        </Link>
      </div>
    );
  }
  // Data ruang sebelumnya diabaikan saat berpindah ke ruang lain
  if (!space || space.id !== spaceId) return <Loading label="Membuka ruang keuangan..." />;

  return (
    <SpaceProvider key={space.id} space={space}>
      <AppShell>{children}</AppShell>
    </SpaceProvider>
  );
}
