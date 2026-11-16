# Frontend — Catat Keuangan

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Recharts.

```bash
cp .env.example .env.local   # API_URL=http://localhost:4000
npm install
npm run dev                  # http://localhost:3000
```

- Semua data diambil dari backend NestJS melalui `/api/*` (lihat `rewrites` di `next.config.ts`); frontend tidak mengakses database.
- `src/proxy.ts` mengarahkan pengguna tanpa cookie sesi ke `/login` (pemeriksaan optimistis; otorisasi sebenarnya di backend).
- Halaman ruang keuangan ada di `src/app/s/[spaceId]/…`; konteks ruang aktif, akun, dan kategori disediakan oleh `src/components/space-context.tsx`.

Lihat [README utama](../README.md) untuk cara menjalankan seluruh aplikasi.
