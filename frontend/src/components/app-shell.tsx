"use client";

import { Wallet as WalletIcon } from "lucide-react";

import {
  ArrowLeftRight,
  BarChart3,
  ChevronsUpDown,
  FileScan,
  LayoutDashboard,
  Menu,
  PiggyBank,
  Repeat,
  Settings,
  Tags,
  Target,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { ROLE_LABEL, SPACE_LABEL, type Space } from "@/lib/types";
import { NotificationsBell } from "./notifications-bell";
import { useSpace } from "./space-context";
import { cn } from "./ui";
import { UserMenu } from "./user-menu";

export function AppShell({ children }: { children: ReactNode }) {
  const { space, totalBalance } = useSpace();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = `/s/${space.id}`;

  const nav = [
    { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `${base}/transactions`, label: "Transaksi", icon: ArrowLeftRight },
    { href: `${base}/accounts`, label: "Akun", icon: Wallet },
    { href: `${base}/categories`, label: "Kategori", icon: Tags },
    { href: `${base}/budgets`, label: "Anggaran", icon: PiggyBank },
    { href: `${base}/goals`, label: "Target Tabungan", icon: Target },
    { href: `${base}/recurring`, label: "Transaksi Berulang", icon: Repeat },
    { href: `${base}/reports`, label: "Laporan", icon: BarChart3 },
    { href: `${base}/import`, label: "Smart Import", icon: FileScan },
    // Menu Anggota hanya untuk ruang Family/Business
    ...(space.type !== "PERSONAL" ? [{ href: `${base}/members`, label: "Anggota", icon: Users }] : []),
    { href: `${base}/settings`, label: "Pengaturan", icon: Settings },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5">
        <Link href="/spaces" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white"><WalletIcon className="h-4 w-4" /></span>
          Catat Keuangan
        </Link>
      </div>
      <div className="px-3 pt-4">
        <SpaceSwitcher current={space} />
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 px-4 py-3">
        <p className="text-xs text-slate-500">Total saldo ruang</p>
        <p className="text-base font-semibold tabular-nums text-slate-900">{formatMoney(totalBalance, space.currency)}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded-md p-1 text-slate-500" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{space.name}</p>
            <p className="text-xs text-slate-500">
              {SPACE_LABEL[space.type]} · {ROLE_LABEL[space.role]}
            </p>
          </div>
          <NotificationsBell />
          <UserMenu />
        </header>
        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SpaceSwitcher({ current }: { current: Space }) {
  const [open, setOpen] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (open && !spaces.length) api.get<Space[]>("/finance-spaces").then(setSpaces).catch(() => {});
  }, [open, spaces.length]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">{current.name}</span>
          <span className="block text-xs text-slate-500">Ruang {SPACE_LABEL[current.type]}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute inset-x-0 z-40 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {spaces.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpen(false);
                router.push(`/s/${s.id}`);
              }}
              className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-slate-50", s.id === current.id && "bg-emerald-50 text-emerald-700")}
            >
              {s.name}
              <span className="ml-1 text-xs text-slate-400">· {SPACE_LABEL[s.type]}</span>
            </button>
          ))}
          <Link href="/spaces" className="block border-t border-slate-100 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-slate-50">
            Kelola / buat ruang baru
          </Link>
        </div>
      )}
    </div>
  );
}
