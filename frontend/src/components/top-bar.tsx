"use client";

import { Wallet as WalletIcon } from "lucide-react";

import Link from "next/link";
import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";

/** Header sederhana untuk halaman di luar ruang keuangan (daftar ruang, profil). */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/spaces" className="flex flex-1 items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white"><WalletIcon className="h-4 w-4" /></span>
          Catat Keuangan
        </Link>
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
