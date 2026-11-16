-- =============================================================================
-- Data contoh (demo) — opsional.
-- Login demo : demo@example.com / password123
-- Tanggal transaksi relatif terhadap CURRENT_DATE agar dashboard langsung terisi.
-- =============================================================================
BEGIN;

-- Pengguna demo (hash scrypt untuk "password123", format: scrypt$N$r$p$salt$hash)
INSERT INTO users (id, name, email, password_hash) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Pengguna Demo', 'demo@example.com',
   'scrypt$16384$8$1$lMMoY5NYO1xVCthVDcdsYw==$6lm3DOCT+pBWKBvqiOF1mIBG99/EbKfGGgIFcGmNza1CNWO9618LbECBzMZdX15l2wPQEdx6L+CvZDYJ05o80w==');

-- Ruang Personal
INSERT INTO finance_spaces (id, name, type, currency, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Keuangan Pribadi', 'PERSONAL', 'IDR',
   '00000000-0000-4000-8000-000000000001');

INSERT INTO space_members (finance_space_id, user_id, role, status, joined_at, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
   'OWNER', 'ACTIVE', now(), '00000000-0000-4000-8000-000000000001');

-- Akun
INSERT INTO accounts (id, finance_space_id, name, type, opening_balance, opening_balance_date, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Rekening BCA', 'BANK',    5000000, (date_trunc('month', CURRENT_DATE) - interval '1 month')::date, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'Dompet Tunai', 'CASH',     300000, (date_trunc('month', CURRENT_DATE) - interval '1 month')::date, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1', 'GoPay',        'EWALLET',  150000, (date_trunc('month', CURRENT_DATE) - interval '1 month')::date, '00000000-0000-4000-8000-000000000001');

-- Kategori bawaan (sesuai bagian 9.3 dokumen perencanaan)
INSERT INTO categories (id, finance_space_id, name, type, icon, color, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Gaji',            'INCOME',  '💼', '#16a34a', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'Bonus',           'INCOME',  '🎁', '#22c55e', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', 'Hadiah',          'INCOME',  '🎉', '#84cc16', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a1', 'Pendapatan lain', 'INCOME',  '➕', '#10b981', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'Makanan',         'EXPENSE', '🍽️', '#ef4444', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', 'Jajan',           'EXPENSE', '🧋', '#f97316', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', 'Transportasi',    'EXPENSE', '🚗', '#eab308', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000a1', 'Hiburan',         'EXPENSE', '🎬', '#a855f7', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000a1', 'Kesehatan',       'EXPENSE', '💊', '#ec4899', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000a1', 'Cicilan',         'EXPENSE', '🏦', '#6366f1', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000a1', 'Tagihan',         'EXPENSE', '🧾', '#0ea5e9', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a1', 'Belanja',         'EXPENSE', '🛒', '#14b8a6', '00000000-0000-4000-8000-000000000001');

-- Transaksi bulan berjalan
INSERT INTO transactions (finance_space_id, account_id, destination_account_id, category_id, type, amount, transaction_date, description, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000c1', 'INCOME',   8500000, date_trunc('month', now()) + interval '1 day 9 hour',  'Gaji bulanan',          '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000d6', 'EXPENSE',  1750000, date_trunc('month', now()) + interval '2 day 10 hour', 'Cicilan motor',         '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000d7', 'EXPENSE',   450000, date_trunc('month', now()) + interval '3 day 8 hour',  'Listrik & internet',    '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', NULL, 'TRANSFER', 1000000, date_trunc('month', now()) + interval '3 day 12 hour', 'Tarik tunai', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', NULL, '00000000-0000-4000-8000-0000000000d1', 'EXPENSE',    85000, date_trunc('month', now()) + interval '4 day 12 hour', 'Makan siang',           '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3', NULL, '00000000-0000-4000-8000-0000000000d3', 'EXPENSE',    42000, date_trunc('month', now()) + interval '5 day 7 hour',  'Ojek online',           '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', NULL, '00000000-0000-4000-8000-0000000000d2', 'EXPENSE',    35000, date_trunc('month', now()) + interval '5 day 15 hour', 'Kopi susu',             '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000d8', 'EXPENSE',   620000, date_trunc('month', now()) + interval '6 day 19 hour', 'Belanja bulanan',       '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000d4', 'EXPENSE',   150000, date_trunc('month', now()) + interval '7 day 20 hour', 'Nonton bioskop',        '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000c4', 'INCOME',    500000, date_trunc('month', now()) + interval '8 day 11 hour', 'Jual barang bekas',     '00000000-0000-4000-8000-000000000001'),
  -- bulan lalu (untuk perbandingan periode)
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000c1', 'INCOME',   8500000, date_trunc('month', now()) - interval '1 month' + interval '1 day 9 hour', 'Gaji bulanan', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', NULL, '00000000-0000-4000-8000-0000000000d1', 'EXPENSE', 1200000, date_trunc('month', now()) - interval '1 month' + interval '10 day',     'Makan sebulan', '00000000-0000-4000-8000-000000000001');

-- Anggaran bulan berjalan
INSERT INTO budgets (finance_space_id, category_id, period, start_date, end_date, amount, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1', 'MONTHLY',
   date_trunc('month', CURRENT_DATE)::date, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
   1500000, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d8', 'MONTHLY',
   date_trunc('month', CURRENT_DATE)::date, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
   700000, '00000000-0000-4000-8000-000000000001');

-- Target tabungan
INSERT INTO savings_goals (id, finance_space_id, name, target_amount, target_date, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', 'Dana Darurat', 20000000,
   (CURRENT_DATE + interval '1 year')::date, '00000000-0000-4000-8000-000000000001');

INSERT INTO goal_contributions (finance_space_id, goal_id, account_id, amount, contribution_date, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1',
   2500000, CURRENT_DATE, '00000000-0000-4000-8000-000000000001');

COMMIT;
