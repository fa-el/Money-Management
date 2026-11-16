"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { cn } from "./ui";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await api.get<{ data: Notification[]; unread: number }>("/notifications");
      setItems(res.data);
      setUnread(res.unread);
    } catch {
      /* abaikan */
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(load, 60_000);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => {
      clearInterval(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const markAll = async () => {
    await api.post("/notifications/read-all");
    void load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifikasi"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">Notifikasi</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-medium text-emerald-700 hover:underline">
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">Belum ada notifikasi</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.isRead) {
                    await api.patch(`/notifications/${n.id}/read`);
                    void load();
                  }
                }}
                className={cn("block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", !n.isRead && "bg-emerald-50/50")}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                  <div>
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
