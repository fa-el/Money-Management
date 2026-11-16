-- =============================================================================
-- Contoh query operasional / laporan (opsional, untuk dijalankan manual di psql).
-- Ganti :space_id dengan UUID finance space, mis.:
--   psql ... -v space_id="'00000000-0000-4000-8000-0000000000a1'" -f database/queries.sql
-- =============================================================================

-- 1. Saldo per akun (view account_balances) dan total saldo ruang (akun aktif)
SELECT name, type, balance FROM account_balances WHERE finance_space_id = :space_id ORDER BY name;
SELECT SUM(balance) AS total_saldo FROM account_balances WHERE finance_space_id = :space_id AND is_active;

-- 2. Ringkasan pemasukan/pengeluaran per bulan (transfer tidak dihitung)
SELECT date_trunc('month', transaction_date AT TIME ZONE 'Asia/Jakarta')::date AS bulan,
       SUM(amount) FILTER (WHERE type = 'INCOME')  AS pemasukan,
       SUM(amount) FILTER (WHERE type = 'EXPENSE') AS pengeluaran
FROM transactions
WHERE finance_space_id = :space_id AND status = 'VALID' AND deleted_at IS NULL AND type <> 'TRANSFER'
GROUP BY 1 ORDER BY 1 DESC;

-- 3. Pengeluaran per kategori bulan berjalan
SELECT COALESCE(c.name, 'Tanpa kategori') AS kategori, SUM(t.amount) AS total
FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
WHERE t.finance_space_id = :space_id AND t.type = 'EXPENSE' AND t.status = 'VALID' AND t.deleted_at IS NULL
  AND t.transaction_date >= date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta'
GROUP BY 1 ORDER BY 2 DESC;

-- 4. Realisasi anggaran yang sedang aktif
SELECT c.name AS kategori, b.amount AS anggaran, COALESCE(SUM(t.amount), 0) AS terpakai,
       ROUND(COALESCE(SUM(t.amount), 0) / b.amount * 100, 1) AS persen
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t ON t.category_id = b.category_id AND t.type = 'EXPENSE' AND t.status = 'VALID'
 AND t.deleted_at IS NULL AND (t.transaction_date AT TIME ZONE 'Asia/Jakarta')::date BETWEEN b.start_date AND b.end_date
WHERE b.finance_space_id = :space_id AND b.deleted_at IS NULL AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
GROUP BY c.name, b.amount ORDER BY persen DESC;

-- 5. Anggota ruang beserta role
SELECT u.name, u.email, m.role, m.status FROM space_members m JOIN users u ON u.id = m.user_id
WHERE m.finance_space_id = :space_id AND m.deleted_at IS NULL;

-- 6. Jejak audit terbaru
SELECT a.created_at, u.name AS aktor, a.action, a.entity_type FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
WHERE a.finance_space_id = :space_id ORDER BY a.created_at DESC LIMIT 20;
