# Database — PostgreSQL

Skema database dibuat langsung dengan **SQL murni** dan menjadi sumber kebenaran struktur data.
Prisma (di `backend/`) hanya membaca skema ini untuk menghasilkan client — **jangan** menjalankan
`prisma migrate` atau `prisma db push` terhadap database ini.

| File | Isi |
|---|---|
| `schema.sql` | Seluruh tabel, enum, constraint, index, trigger `updated_at`, dan view `account_balances` (sesuai ERD) |
| `seed.sql` | Data demo opsional — login `demo@example.com` / `password123` |
| `queries.sql` | Contoh query laporan (saldo, ringkasan bulanan, anggaran, audit) |
| `reset.sql` | Menghapus seluruh objek skema (semua data hilang) |

Kebutuhan: PostgreSQL **13 atau lebih baru** (memakai `gen_random_uuid()` bawaan).

---

## Opsi A — Docker (disarankan)

Dari root repo:

```bash
docker compose up -d          # menjalankan PostgreSQL 17 di port 5432
docker compose logs -f db     # tunggu "database system is ready to accept connections"
```

Saat volume masih kosong, `schema.sql` lalu `seed.sql` dijalankan **otomatis** oleh container.

Kredensial default (bisa diubah lewat environment variable sebelum `docker compose up`):

| Variabel | Default |
|---|---|
| `POSTGRES_USER` | `money` |
| `POSTGRES_PASSWORD` | `money_secret` |
| `POSTGRES_DB` | `money_management` |
| `POSTGRES_PORT` | `5432` |

Perintah yang sering dipakai:

```bash
# Masuk ke psql
docker exec -it money-db psql -U money -d money_management

# Menjalankan file SQL secara manual
docker exec -i money-db psql -U money -d money_management < database/schema.sql

# Menjalankan contoh query untuk ruang demo
docker exec -i money-db psql -U money -d money_management \
  -v space_id="'00000000-0000-4000-8000-0000000000a1'" < database/queries.sql

# Reset total (hapus volume, skema & seed dijalankan ulang otomatis)
docker compose down -v && docker compose up -d
```

## Opsi B — PostgreSQL terpasang lokal / server sendiri

```bash
# 1. Buat user dan database (sebagai superuser postgres)
psql -U postgres -c "CREATE USER money WITH PASSWORD 'money_secret';"
psql -U postgres -c "CREATE DATABASE money_management OWNER money;"

# 2. Buat skema
psql -U money -d money_management -f database/schema.sql

# 3. (Opsional) isi data demo
psql -U money -d money_management -f database/seed.sql
```

Reset skema tanpa menghapus database:

```bash
psql -U money -d money_management -f database/reset.sql
psql -U money -d money_management -f database/schema.sql
```

Lalu sesuaikan `DATABASE_URL` di `backend/.env`:

```
DATABASE_URL="postgresql://money:money_secret@localhost:5432/money_management?schema=public"
```

---

## Catatan desain

- **UUID** untuk semua primary key; **NUMERIC(18,2)** untuk nominal (tidak pernah float).
- **Isolasi multi-tenant**: setiap tabel data memiliki `finance_space_id`. Relasi antar-tabel memakai
  *composite foreign key* `(id, finance_space_id)`, sehingga transaksi tidak mungkin menunjuk akun atau
  kategori milik ruang lain — dijaga oleh database, bukan hanya oleh aplikasi.
- **Saldo tidak disimpan**; dihitung dari transaksi berstatus `VALID` yang belum dihapus:
  `saldo = saldo awal + pemasukan + transfer masuk − pengeluaran − transfer keluar` (view `account_balances`).
  Mengubah/menghapus transaksi otomatis konsisten, tanpa risiko saldo ganda.
- **Transfer** disimpan di tabel `transactions` dengan `type = 'TRANSFER'` dan `destination_account_id`
  (CHECK: akun tujuan wajib, berbeda dari akun asal, dan tanpa kategori).
- **Soft delete** (`deleted_at`, `deleted_by`) + `audit_logs` untuk jejak perubahan. Unique index dibuat
  parsial (`WHERE deleted_at IS NULL`) agar data yang dihapus tidak menghalangi data baru.
- **Transaksi berulang** idempoten: unique index `(recurring_transaction_id, recurrence_date)`.
- **Smart Import**: satu hasil ekstraksi hanya bisa menjadi satu transaksi (unique parsial di
  `imported_transaction_links`).

### Penyesuaian kecil terhadap ERD

| Perubahan | Alasan |
|---|---|
| Kolom `recurring_transactions.description` | Keterangan untuk transaksi yang dibuat otomatis |
| Kolom `import_jobs.error_message` | Menyimpan pesan gagal/peringatan proses ekstraksi untuk ditampilkan ke pengguna |
| Email unik via index `lower(email)` | Implementasi "case-insensitive unique" pada ERD |
