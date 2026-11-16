# Money-Management
Aplikasi pencatatan keuangan untuk **Personal**, **Family**, dan **Business Finance** dalam satu platform,
dibangun berdasarkan *Dokumen Perencanaan Aplikasi Pencatatan Keuangan* v1.0 + Addendum v1.1 (Smart Import) dan ERD.

| Lapisan | Teknologi | Folder |
|---|---|---|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS 4 + Recharts | [`frontend/`](frontend/) |
| Backend | NestJS 11 + TypeScript (REST API, Swagger) | [`backend/`](backend/) |
| ORM | Prisma 6 (client saja; skema dari SQL) | [`backend/prisma/`](backend/prisma/) |
| Database | PostgreSQL 17 — skema dalam SQL murni | [`database/`](database/) |

## Fitur

- **Autentikasi** — register, login, logout, sesi (token acak, disimpan sebagai hash SHA-256, cookie httpOnly), hash password scrypt, ubah password.
- **Finance space** — ruang Pribadi/Keluarga/Bisnis dengan data terpisah, kategori bawaan per tipe ruang, pindah ruang.
- **Anggota & role** — undang anggota (Family/Business), terima/tolak undangan, ubah role, keluarkan, alihkan kepemilikan. Role `OWNER > ADMIN > EDITOR > MEMBER > VIEWER` diperiksa di setiap request.
- **Akun** — rekening/kas/e-wallet, saldo awal + tanggal efektif, aktif/nonaktif, saldo per akun & total ruang.
- **Kategori** — CRUD pemasukan/pengeluaran dengan ikon, warna, status aktif.
- **Transaksi** — pemasukan, pengeluaran, transfer atomik; ubah, batalkan (void), hapus (soft delete); filter, pencarian, paginasi, export CSV.
- **Dashboard & laporan** — saldo, pemasukan, pengeluaran, selisih, perbandingan periode sebelumnya, tren arus kas, komposisi kategori, ringkasan per akun.
- **Anggaran** — per kategori & periode, realisasi, sisa, indikator dan notifikasi 80% / 100%.
- **Target tabungan** — target, kontribusi, progres, otomatis "tercapai".
- **Transaksi berulang** — harian/mingguan/bulanan/tahunan, dijalankan otomatis tiap hari 00:05 WIB (idempoten, mengejar jadwal yang terlewat).
- **Smart Import** — unggah struk dan e-statement, review & koreksi, mapping debit/kredit/transfer, saran kategori, deteksi duplikasi, rekonsiliasi saldo, impor hanya baris yang disetujui, jejak dokumen sumber.
- **Audit log & notifikasi**.

## Menjalankan aplikasi (development)

Prasyarat: **Node.js 20+** (diuji dengan 24), **npm**, dan **Docker** (atau PostgreSQL 13+ lokal).

### 1. Database

```bash
docker compose up -d
```

Skema (`database/schema.sql`) dan data demo (`database/seed.sql`) dijalankan otomatis.
Tanpa Docker atau untuk detail lain, lihat **[database/README.md](database/README.md)**.

### 2. Backend (port 4000)

```bash
cd backend
cp .env.example .env        # sesuaikan DATABASE_URL bila perlu
npm install
npx prisma generate
npm run start:dev
```

- API: http://localhost:4000/api
- Dokumentasi Swagger: http://localhost:4000/api/docs
- Health check: http://localhost:4000/api/health

### 3. Frontend (port 3000)

```bash
cd frontend
cp .env.example .env.local  # API_URL=http://localhost:4000
npm install
npm run dev
```

Buka http://localhost:3000 dan login dengan akun demo **`demo@example.com` / `password123`**, atau daftar akun baru.

Frontend memanggil `/api/*` di origin-nya sendiri, dan Next.js meneruskannya ke backend (rewrites), sehingga cookie sesi tetap first-party.

### Mencoba Smart Import

File contoh e-statement ada di [`samples/contoh-mutasi-rekening.csv`](samples/contoh-mutasi-rekening.csv).
Buka **Smart Import → E-statement**, pilih akun "Rekening BCA", unggah file tersebut, lalu periksa hasil
rekonsiliasi dan peringatan duplikasi sebelum menyetujui.

**Ekstraksi otomatis (opsional).** CSV/XLSX selalu diproses oleh parser bawaan. Untuk membaca **foto struk**
dan **PDF e-statement** secara otomatis, isi `ANTHROPIC_API_KEY` di `backend/.env`; dokumen akan dikirim ke
Claude API untuk diekstrak. Tanpa key, struk tetap bisa diunggah dan diisi manual sambil melihat pratinjau,
dan unggahan PDF e-statement ditolak dengan pesan yang jelas. Apa pun hasilnya, transaksi baru dibuat setelah
pengguna meninjau dan menyetujuinya.

## Build production

```bash
# backend
cd backend && npm run build && npm run start:prod

# frontend
cd frontend && npm run build && npm start
```

Checklist production (bagian 15 dokumen perencanaan):

- Set `COOKIE_SECURE=true`, gunakan HTTPS, dan batasi `CORS_ORIGIN`.
- Simpan secret di environment variable, jangan di repo.
- Arahkan `STORAGE_DIR` ke volume privat (atau ganti `StorageService` dengan object storage privat).
- Jadwalkan backup PostgreSQL (`pg_dump`) dan uji proses restore.
- Jalankan perubahan skema secara terkontrol (file SQL migrasi terpisah).

## Pengujian

```bash
cd backend && npm test      # unit test parser mutasi, normalisasi angka/tanggal, penjadwalan
```

Alur API (aturan transaksi, konsistensi saldo setelah edit/void/hapus, isolasi antar-ruang, role, Smart Import,
transaksi berulang) sudah diuji manual end-to-end terhadap database ini.

## Keputusan desain (Lampiran A)

| Pertanyaan | Keputusan di implementasi ini |
|---|---|
| Boleh punya banyak finance space? | Ya, tanpa batas; satu user bisa punya ruang pribadi dan bisnis |
| Saldo disimpan atau dihitung? | Dihitung dari transaksi (sumber kebenaran) |
| Saldo negatif? | Diperbolehkan (tidak ada blokir saldo minimum) |
| Transaksi sebelum tanggal saldo awal? | Ditolak, agar saldo awal konsisten |
| Penghapusan | Soft delete + audit log; transaksi bisa juga di-*void* |
| Format undangan | Berdasarkan email pengguna yang **sudah terdaftar**; diterima/ditolak di aplikasi (belum via email) |
| Role per tipe ruang | Family: Admin/Member/Viewer · Business: Admin/Editor/Viewer · Personal: tanpa anggota |
| MEMBER | Bisa mencatat transaksi dan hanya mengubah/menghapus transaksinya sendiri |
| Kontribusi tabungan | Penanda alokasi dana (tidak mengubah saldo); pindahkan uang dengan Transfer bila perlu |
| Struk | Satu struk = satu transaksi total, rincian item disimpan sebagai detail |
| Export | CSV (transaksi & laporan) |
| Multi-currency | Field `currency` tersedia; MVP fokus IDR |

**Belum diimplementasikan** (di luar MVP atau perlu keputusan lanjutan): visibilitas transaksi pribadi anggota
keluarga, reset password & verifikasi email, undangan via email/link, export Excel/PDF, split struk per kategori,
dan rate limiting login.
