import { Suspense } from "react";
import { SpaceLayoutClient } from "@/components/space-layout-client";
import { Loading } from "@/components/ui";

// Data ruang diambil di klien (via API backend); Suspense diperlukan karena
// useParams() hanya tersedia saat runtime (Cache Components).
export default function SpaceLayout({ children }: LayoutProps<"/s/[spaceId]">) {
  return (
    <Suspense fallback={<Loading label="Membuka ruang keuangan..." />}>
      <SpaceLayoutClient>{children}</SpaceLayoutClient>
    </Suspense>
  );
}
