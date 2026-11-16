"use client";

import { FileSpreadsheet, FileText, Receipt, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImportStatus } from "@/components/import-status";
import { useSpace } from "@/components/space-context";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, Field, Loading, PageHeader, Select, cn } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { ImportJob, Paginated } from "@/lib/types";

interface Capabilities {
  aiExtraction: boolean;
  receiptEngine: "claude" | "paddleocr" | null;
  maxUploadMb: number;
  receiptFormats: string[];
  statementFormats: string[];
}

export default function ImportPage() {
  const { space, accounts, can } = useSpace();
  const toast = useToast();
  const router = useRouter();
  const caps = useFetch(() => api.get<Capabilities>(`/finance-spaces/${space.id}/imports/capabilities`), [space.id]);
  const jobs = useFetch(() => api.get<Paginated<ImportJob>>(`/finance-spaces/${space.id}/imports`, { pageSize: 50 }), [space.id]);
  const [sourceType, setSourceType] = useState<"RECEIPT" | "E_STATEMENT">("RECEIPT");
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Polling ringan selama ada dokumen yang masih diproses
  useEffect(() => {
    if (!jobs.data?.data.some((j) => j.status === "PROCESSING" || j.status === "UPLOADED")) return;
    const t = setTimeout(() => void jobs.reload(), 2000);
    return () => clearTimeout(t);
  }, [jobs.data, jobs]);

  const accept = sourceType === "RECEIPT" ? ".jpg,.jpeg,.png,.webp,.pdf" : caps.data?.statementFormats.includes("PDF") ? ".csv,.xlsx,.pdf" : ".csv,.xlsx";
  const receiptHint =
    caps.data?.receiptEngine === "claude"
      ? "Merchant, tanggal, item & total dibaca otomatis (AI)."
      : caps.data?.receiptEngine === "paddleocr"
        ? "Merchant, tanggal, item & total dibaca otomatis dengan OCR lokal (gratis, offline)."
        : "Isi data struk manual sambil melihat pratinjau.";

  const upload = async () => {
    if (!file) return;
    if (caps.data && file.size > caps.data.maxUploadMb * 1024 * 1024) return toast.error(`Ukuran file maksimal ${caps.data.maxUploadMb} MB`);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("sourceType", sourceType);
      if (accountId) form.append("accountId", accountId);
      form.append("file", file);
      const job = await api.upload<ImportJob & { warnings: string[] }>(`/finance-spaces/${space.id}/imports`, form);
      job.warnings.forEach((w) => toast.error(w));
      router.push(`/s/${space.id}/import/${job.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader title="Smart Import" description="Baca struk belanja atau e-statement rekening, periksa hasilnya, lalu impor sebagai transaksi." />
      {can("MEMBER") && (
        <Card className="mb-6 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["RECEIPT", Receipt, "Struk / Bon", `Foto ${caps.data?.receiptFormats.join(", ") ?? ""}. ${receiptHint}`],
                ["E_STATEMENT", FileSpreadsheet, "E-statement / Mutasi", `File ${caps.data?.statementFormats.join(", ") ?? ""} dari internet/mobile banking. Termasuk deteksi duplikasi & rekonsiliasi saldo.`],
              ] as const
            ).map(([value, Icon, title, desc]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSourceType(value);
                  setFile(null);
                }}
                className={cn("flex gap-3 rounded-lg border p-4 text-left transition", sourceType === value ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-slate-200 hover:bg-slate-50")}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-xs text-slate-500">{desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label={sourceType === "E_STATEMENT" ? "Akun rekening (disarankan)" : "Akun pembayaran (opsional)"} hint="Dapat diubah saat review">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Pilih nanti</option>
                {accounts.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center text-sm md:col-span-2",
                drag ? "border-emerald-500 bg-emerald-50" : "border-slate-300 hover:bg-slate-50",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
              }}
            >
              <Upload className="mb-1 h-5 w-5 text-slate-400" />
              {file ? (
                <span className="font-medium text-slate-800">
                  {file.name} <span className="text-slate-500">({formatBytes(file.size)})</span>
                </span>
              ) : (
                <span className="text-slate-500">Seret file ke sini atau klik untuk memilih ({accept.replaceAll(",", " ")}) · maks {caps.data?.maxUploadMb ?? 10} MB</span>
              )}
              <input ref={inputRef} type="file" hidden accept={accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> File disimpan privat. Aplikasi tidak pernah meminta username/password/PIN/OTP bank. PDF berpassword harus dibuka dulu.
            </p>
            <Button onClick={upload} disabled={!file} loading={uploading}>
              Unggah & proses
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="px-5 pt-5 font-semibold">Riwayat dokumen</h2>
        {!jobs.data ? (
          <Loading />
        ) : jobs.data.data.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Belum ada dokumen" />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {jobs.data.data.map((j) => (
              <li key={j.id}>
                <Link href={`/s/${space.id}/import/${j.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  {j.sourceType === "RECEIPT" ? <Receipt className="h-5 w-5 text-slate-400" /> : <FileSpreadsheet className="h-5 w-5 text-slate-400" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{j.file.originalName}</span>
                    <span className="block text-xs text-slate-500">
                      {j.sourceType === "RECEIPT" ? "Struk" : "E-statement"} · {formatDateTime(j.createdAt)} · {j.recordCount} baris
                      {j.periodStart && ` · periode ${formatDate(j.periodStart)}–${formatDate(j.periodEnd)}`}
                    </span>
                  </span>
                  <ImportStatus status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
