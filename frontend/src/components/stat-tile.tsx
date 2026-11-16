import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Card, cn } from "./ui";

/** Kartu angka utama dengan perubahan vs periode sebelumnya. `goodWhenUp` menentukan makna naik/turun. */
export function StatTile({ label, value, change, goodWhenUp = true, sub, icon }: { label: string; value: ReactNode; change?: number | null; goodWhenUp?: boolean; sub?: ReactNode; icon?: ReactNode }) {
  const hasChange = change !== null && change !== undefined;
  const up = hasChange && change! > 0;
  const good = hasChange && (change === 0 || up === goodWhenUp);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        {hasChange && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-emerald-700" : "text-rose-700")}>
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {up ? "+" : ""}
            {change}%
          </span>
        )}
        {sub}
      </div>
    </Card>
  );
}
