import { ArrowLeftRight, Repeat } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Badge, Money } from "./ui";

export function TransactionRow({ t, currency, onClick, showCreator }: { t: Transaction; currency: string; onClick?: () => void; showCreator?: boolean }) {
  const title =
    t.type === "TRANSFER" ? `${t.account.name} → ${t.destinationAccount?.name}` : t.description || t.category?.name || "Tanpa keterangan";
  const sub = t.type === "TRANSFER" ? t.description || "Transfer antar-akun" : `${t.category?.name ?? "Tanpa kategori"} · ${t.account.name}`;
  return (
    <li>
      <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 px-5 py-3 text-left enabled:hover:bg-slate-50">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
          style={{ background: t.type === "TRANSFER" ? "#e0f2fe" : `${t.category?.color ?? "#94a3b8"}22` }}
        >
          {t.type === "TRANSFER" ? <ArrowLeftRight className="h-4 w-4 text-sky-600" /> : t.category?.icon ?? "•"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-sm font-medium ${t.status === "VOID" ? "text-slate-400 line-through" : "text-slate-800"}`}>{title}</span>
            {t.recurringTransactionId && <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Transaksi berulang" />}
            {t.status === "VOID" && <Badge>Dibatalkan</Badge>}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {sub} · {formatDateTime(t.transactionDate)}
            {showCreator && t.createdByName ? ` · oleh ${t.createdByName}` : ""}
          </span>
        </span>
        <Money value={t.amount} type={t.type} currency={currency} className={`shrink-0 text-sm font-semibold ${t.status === "VOID" ? "opacity-40" : ""}`} />
      </button>
    </li>
  );
}
