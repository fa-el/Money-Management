"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { ROLE_LEVEL, type Account, type Category, type Role, type Space } from "@/lib/types";

interface SpaceCtx {
  space: Space;
  accounts: Account[];
  categories: Category[];
  totalBalance: string;
  /** Memuat ulang akun & kategori (mis. setelah transaksi baru) */
  refresh: () => Promise<void>;
  can: (min: Role) => boolean;
}

const Ctx = createContext<SpaceCtx | null>(null);

export function SpaceProvider({ space, children }: { space: Space; children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalBalance, setTotal] = useState("0");

  const refresh = useCallback(async () => {
    const [acc, cats] = await Promise.all([
      api.get<{ data: Account[]; totalBalance: string }>(`/finance-spaces/${space.id}/accounts`),
      api.get<Category[]>(`/finance-spaces/${space.id}/categories`),
    ]);
    setAccounts(acc.data);
    setTotal(acc.totalBalance);
    setCategories(cats);
  }, [space.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const can = useCallback((min: Role) => ROLE_LEVEL[space.role] >= ROLE_LEVEL[min], [space.role]);

  return <Ctx.Provider value={{ space, accounts, categories, totalBalance, refresh, can }}>{children}</Ctx.Provider>;
}

export function useSpace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSpace harus dipakai di dalam SpaceProvider");
  return ctx;
}
