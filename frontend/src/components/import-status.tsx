import type { ImportJob } from "@/lib/types";
import { Badge } from "./ui";

const MAP: Record<ImportJob["status"], [string, string]> = {
  UPLOADED: ["Diunggah", "slate"],
  PROCESSING: ["Diproses", "blue"],
  NEEDS_REVIEW: ["Perlu review", "amber"],
  APPROVED: ["Disetujui", "blue"],
  IMPORTED: ["Diimpor", "green"],
  FAILED: ["Gagal", "red"],
};

export function ImportStatus({ status }: { status: ImportJob["status"] }) {
  const [label, color] = MAP[status];
  return <Badge color={color}>{label}</Badge>;
}
