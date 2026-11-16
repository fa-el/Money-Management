-- =============================================================================
-- Aplikasi Pencatatan Keuangan — Skema Database PostgreSQL
-- Sumber: "ERD Aplikasi Pencatatan Keuangan" + Dokumen Perencanaan v1.0/v1.1
--
-- Prinsip:
--   * UUID sebagai primary key (gen_random_uuid, bawaan PostgreSQL >= 13).
--   * Nominal uang memakai NUMERIC(18,2), tidak pernah FLOAT (NFR-04).
--   * Semua data ruang memiliki finance_space_id (isolasi multi-tenant).
--   * Composite FK (x_id, finance_space_id) memastikan relasi antar-tabel
--     selalu berada di finance space yang sama (mis. akun transaksi tidak bisa
--     menunjuk akun milik ruang lain).
--   * Soft delete (deleted_at / deleted_by) + audit_logs untuk jejak data.
--   * Saldo TIDAK disimpan; dihitung dari transaksi (sumber kebenaran).
--
-- Skrip ini idempotent untuk database kosong. Untuk reset penuh, jalankan
-- database/reset.sql terlebih dahulu.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- ENUM
-- -----------------------------------------------------------------------------
CREATE TYPE space_type          AS ENUM ('PERSONAL', 'FAMILY', 'BUSINESS');
CREATE TYPE member_role         AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'VIEWER');
CREATE TYPE member_status       AS ENUM ('ACTIVE', 'INVITED', 'INACTIVE');
CREATE TYPE account_type        AS ENUM ('BANK', 'CASH', 'EWALLET');
CREATE TYPE category_type       AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE transaction_type    AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE transaction_status  AS ENUM ('VALID', 'VOID');
CREATE TYPE goal_status         AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE import_file_status  AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'ERROR');
CREATE TYPE import_source_type  AS ENUM ('RECEIPT', 'E_STATEMENT');
CREATE TYPE import_job_status   AS ENUM ('UPLOADED', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'IMPORTED', 'FAILED');
CREATE TYPE review_status       AS ENUM ('PENDING', 'APPROVED', 'IGNORED');

-- -----------------------------------------------------------------------------
-- Trigger umum: updated_at otomatis
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           varchar(120) NOT NULL,
  email          varchar(255) NOT NULL,
  password_hash  varchar(255) NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  updated_by     uuid,
  deleted_at     timestamptz,
  deleted_by     uuid
);
-- Email unik tanpa membedakan huruf besar/kecil
CREATE UNIQUE INDEX users_email_lower_uk ON users (lower(email));

-- -----------------------------------------------------------------------------
-- sessions (token disimpan dalam bentuk hash SHA-256)
-- -----------------------------------------------------------------------------
CREATE TABLE sessions (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  varchar(128) NOT NULL UNIQUE,
  expires_at  timestamptz  NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- -----------------------------------------------------------------------------
-- finance_spaces
-- -----------------------------------------------------------------------------
CREATE TABLE finance_spaces (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(120) NOT NULL,
  type        space_type   NOT NULL,
  currency    varchar(3)   NOT NULL DEFAULT 'IDR',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  created_by  uuid         NOT NULL REFERENCES users (id),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  deleted_by  uuid
);
CREATE INDEX finance_spaces_created_by_idx ON finance_spaces (created_by);

-- -----------------------------------------------------------------------------
-- space_members
-- -----------------------------------------------------------------------------
CREATE TABLE space_members (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid          NOT NULL REFERENCES finance_spaces (id),
  user_id           uuid          NOT NULL REFERENCES users (id),
  role              member_role   NOT NULL,
  status            member_status NOT NULL DEFAULT 'INVITED',
  joined_at         timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid
);
-- Satu user hanya satu keanggotaan aktif (belum dihapus) per ruang
CREATE UNIQUE INDEX space_members_space_user_uk
  ON space_members (finance_space_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX space_members_user_id_idx ON space_members (user_id);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid         NOT NULL REFERENCES users (id),
  finance_space_id  uuid         REFERENCES finance_spaces (id),
  title             varchar(200) NOT NULL,
  message           text         NOT NULL,
  is_read           boolean      NOT NULL DEFAULT false,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid
);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, is_read, created_at DESC);

-- -----------------------------------------------------------------------------
-- accounts (rekening bank, kas, dompet digital)
-- -----------------------------------------------------------------------------
CREATE TABLE accounts (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id      uuid          NOT NULL REFERENCES finance_spaces (id),
  name                  varchar(120)  NOT NULL,
  type                  account_type  NOT NULL,
  opening_balance       numeric(18,2) NOT NULL DEFAULT 0,
  opening_balance_date  date          NOT NULL DEFAULT CURRENT_DATE,
  is_active             boolean       NOT NULL DEFAULT true,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  created_by            uuid          NOT NULL REFERENCES users (id),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  deleted_by            uuid,
  CONSTRAINT accounts_id_space_uk UNIQUE (id, finance_space_id)
);
CREATE INDEX accounts_space_idx ON accounts (finance_space_id) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid          NOT NULL REFERENCES finance_spaces (id),
  name              varchar(80)   NOT NULL,
  type              category_type NOT NULL,
  icon              varchar(40),
  color             varchar(20),
  is_active         boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid          NOT NULL REFERENCES users (id),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid,
  CONSTRAINT categories_id_space_uk UNIQUE (id, finance_space_id)
);
CREATE UNIQUE INDEX categories_space_type_name_uk
  ON categories (finance_space_id, type, lower(name)) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- recurring_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE recurring_transactions (
  id                      uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id        uuid             NOT NULL REFERENCES finance_spaces (id),
  account_id              uuid             NOT NULL,
  destination_account_id  uuid,
  category_id             uuid,
  type                    transaction_type NOT NULL,
  amount                  numeric(18,2)    NOT NULL CHECK (amount > 0),
  description             text,
  frequency               varchar(10)      NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
  start_date              date             NOT NULL,
  next_execution_date     date             NOT NULL,
  last_execution_at       timestamptz,
  end_date                date,
  is_active               boolean          NOT NULL DEFAULT true,
  created_at              timestamptz      NOT NULL DEFAULT now(),
  created_by              uuid             NOT NULL REFERENCES users (id),
  updated_at              timestamptz      NOT NULL DEFAULT now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  deleted_by              uuid,
  CONSTRAINT recurring_id_space_uk UNIQUE (id, finance_space_id),
  CONSTRAINT recurring_account_fk FOREIGN KEY (account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id),
  CONSTRAINT recurring_destination_fk FOREIGN KEY (destination_account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id),
  CONSTRAINT recurring_category_fk FOREIGN KEY (category_id, finance_space_id)
    REFERENCES categories (id, finance_space_id),
  CONSTRAINT recurring_end_after_start CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT recurring_transfer_rule CHECK (
    (type = 'TRANSFER' AND destination_account_id IS NOT NULL
       AND destination_account_id <> account_id AND category_id IS NULL)
    OR (type <> 'TRANSFER' AND destination_account_id IS NULL)
  )
);
CREATE INDEX recurring_due_idx ON recurring_transactions (next_execution_date)
  WHERE is_active AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- transactions (pemasukan, pengeluaran, dan transfer)
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
  id                        uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id          uuid               NOT NULL REFERENCES finance_spaces (id),
  account_id                uuid               NOT NULL,
  destination_account_id    uuid,
  category_id               uuid,
  recurring_transaction_id  uuid,
  recurrence_date           date,
  type                      transaction_type   NOT NULL,
  amount                    numeric(18,2)      NOT NULL CHECK (amount > 0),
  transaction_date          timestamptz        NOT NULL,
  description               text,
  status                    transaction_status NOT NULL DEFAULT 'VALID',
  created_at                timestamptz        NOT NULL DEFAULT now(),
  created_by                uuid               NOT NULL REFERENCES users (id),
  updated_at                timestamptz        NOT NULL DEFAULT now(),
  updated_by                uuid,
  deleted_at                timestamptz,
  deleted_by                uuid,
  CONSTRAINT transactions_id_space_uk UNIQUE (id, finance_space_id),
  CONSTRAINT transactions_account_fk FOREIGN KEY (account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id),
  CONSTRAINT transactions_destination_fk FOREIGN KEY (destination_account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id),
  CONSTRAINT transactions_category_fk FOREIGN KEY (category_id, finance_space_id)
    REFERENCES categories (id, finance_space_id),
  CONSTRAINT transactions_recurring_fk FOREIGN KEY (recurring_transaction_id, finance_space_id)
    REFERENCES recurring_transactions (id, finance_space_id),
  -- Transfer: wajib akun tujuan berbeda dan tanpa kategori.
  -- Pemasukan/pengeluaran: tidak boleh punya akun tujuan.
  CONSTRAINT transactions_transfer_rule CHECK (
    (type = 'TRANSFER' AND destination_account_id IS NOT NULL
       AND destination_account_id <> account_id AND category_id IS NULL)
    OR (type <> 'TRANSFER' AND destination_account_id IS NULL)
  ),
  CONSTRAINT transactions_recurrence_pair CHECK (
    (recurring_transaction_id IS NULL) = (recurrence_date IS NULL)
  )
);
CREATE INDEX transactions_space_date_idx
  ON transactions (finance_space_id, transaction_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX transactions_account_idx      ON transactions (account_id);
CREATE INDEX transactions_destination_idx  ON transactions (destination_account_id);
CREATE INDEX transactions_category_idx     ON transactions (category_id);
-- Idempotensi eksekusi transaksi berulang: satu jadwal hanya satu transaksi per tanggal
CREATE UNIQUE INDEX transactions_recurrence_uk
  ON transactions (recurring_transaction_id, recurrence_date)
  WHERE recurring_transaction_id IS NOT NULL AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- budgets
-- -----------------------------------------------------------------------------
CREATE TABLE budgets (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid          NOT NULL REFERENCES finance_spaces (id),
  category_id       uuid          NOT NULL,
  period            varchar(10)   NOT NULL CHECK (period IN ('WEEKLY', 'MONTHLY', 'YEARLY')),
  start_date        date          NOT NULL,
  end_date          date          NOT NULL,
  amount            numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid          NOT NULL REFERENCES users (id),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid,
  CONSTRAINT budgets_category_fk FOREIGN KEY (category_id, finance_space_id)
    REFERENCES categories (id, finance_space_id),
  CONSTRAINT budgets_end_after_start CHECK (end_date >= start_date)
);
CREATE INDEX budgets_space_period_idx ON budgets (finance_space_id, start_date, end_date)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- savings_goals & goal_contributions
-- -----------------------------------------------------------------------------
CREATE TABLE savings_goals (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid          NOT NULL REFERENCES finance_spaces (id),
  name              varchar(120)  NOT NULL,
  target_amount     numeric(18,2) NOT NULL CHECK (target_amount > 0),
  target_date       date,
  status            goal_status   NOT NULL DEFAULT 'ACTIVE',
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid          NOT NULL REFERENCES users (id),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid,
  CONSTRAINT savings_goals_id_space_uk UNIQUE (id, finance_space_id)
);
CREATE INDEX savings_goals_space_idx ON savings_goals (finance_space_id) WHERE deleted_at IS NULL;

CREATE TABLE goal_contributions (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id   uuid          NOT NULL REFERENCES finance_spaces (id),
  goal_id            uuid          NOT NULL,
  account_id         uuid          NOT NULL,
  amount             numeric(18,2) NOT NULL CHECK (amount > 0),
  contribution_date  date          NOT NULL,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  created_by         uuid          NOT NULL REFERENCES users (id),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  updated_by         uuid,
  deleted_at         timestamptz,
  deleted_by         uuid,
  CONSTRAINT goal_contributions_goal_fk FOREIGN KEY (goal_id, finance_space_id)
    REFERENCES savings_goals (id, finance_space_id),
  CONSTRAINT goal_contributions_account_fk FOREIGN KEY (account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id)
);
CREATE INDEX goal_contributions_goal_idx ON goal_contributions (goal_id);

-- -----------------------------------------------------------------------------
-- Smart Import: import_files, import_jobs, bank_statement_balances,
--               extracted_records, receipt_items, imported_transaction_links
-- -----------------------------------------------------------------------------
CREATE TABLE import_files (
  id             uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key    varchar(255)       NOT NULL UNIQUE,
  original_name  varchar(255)       NOT NULL,
  mime_type      varchar(120)       NOT NULL,
  size_bytes     bigint             NOT NULL CHECK (size_bytes >= 0),
  checksum       varchar(128)       NOT NULL,
  status         import_file_status NOT NULL DEFAULT 'UPLOADED',
  created_at     timestamptz        NOT NULL DEFAULT now(),
  created_by     uuid               NOT NULL REFERENCES users (id), -- pengunggah
  updated_at     timestamptz        NOT NULL DEFAULT now(),
  updated_by     uuid,
  deleted_at     timestamptz,
  deleted_by     uuid
);
CREATE INDEX import_files_checksum_idx ON import_files (checksum);

CREATE TABLE import_jobs (
  id                uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid               NOT NULL REFERENCES finance_spaces (id),
  account_id        uuid,
  source_type       import_source_type NOT NULL,
  file_id           uuid               NOT NULL REFERENCES import_files (id),
  status            import_job_status  NOT NULL DEFAULT 'UPLOADED',
  error_message     text,
  period_start      date,
  period_end        date,
  created_at        timestamptz        NOT NULL DEFAULT now(),
  created_by        uuid               NOT NULL REFERENCES users (id),
  updated_at        timestamptz        NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid,
  CONSTRAINT import_jobs_id_space_uk UNIQUE (id, finance_space_id),
  CONSTRAINT import_jobs_account_fk FOREIGN KEY (account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id)
);
CREATE INDEX import_jobs_space_idx ON import_jobs (finance_space_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX import_jobs_file_idx ON import_jobs (file_id);

CREATE TABLE bank_statement_balances (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid          NOT NULL REFERENCES finance_spaces (id),
  import_job_id     uuid          NOT NULL,
  account_id        uuid          NOT NULL,
  opening_balance   numeric(18,2),
  ending_balance    numeric(18,2),
  total_debit       numeric(18,2),
  total_credit      numeric(18,2),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid,
  CONSTRAINT bsb_import_job_fk FOREIGN KEY (import_job_id, finance_space_id)
    REFERENCES import_jobs (id, finance_space_id),
  CONSTRAINT bsb_account_fk FOREIGN KEY (account_id, finance_space_id)
    REFERENCES accounts (id, finance_space_id)
);
CREATE INDEX bsb_import_job_idx ON bank_statement_balances (import_job_id);

CREATE TABLE extracted_records (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid          NOT NULL REFERENCES finance_spaces (id),
  import_job_id     uuid          NOT NULL,
  record_type       varchar(40)   NOT NULL,   -- RECEIPT | STATEMENT_LINE | OPENING_BALANCE | ENDING_BALANCE
  raw_data          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  normalized_data   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  confidence        numeric(5,4)  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  review_status     review_status NOT NULL DEFAULT 'PENDING',
  reviewed_at       timestamptz,
  reviewed_by       uuid          REFERENCES users (id),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  deleted_by        uuid,
  CONSTRAINT extracted_records_id_space_uk UNIQUE (id, finance_space_id),
  CONSTRAINT extracted_records_job_fk FOREIGN KEY (import_job_id, finance_space_id)
    REFERENCES import_jobs (id, finance_space_id)
);
CREATE INDEX extracted_records_job_idx ON extracted_records (import_job_id);

CREATE TABLE receipt_items (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_record_id  uuid          NOT NULL REFERENCES extracted_records (id) ON DELETE CASCADE,
  item_name            varchar(255)  NOT NULL,
  quantity             numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price           numeric(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total           numeric(18,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  created_by           uuid,
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  updated_by           uuid,
  deleted_at           timestamptz,
  deleted_by           uuid
);
CREATE INDEX receipt_items_record_idx ON receipt_items (extracted_record_id);

CREATE TABLE imported_transaction_links (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id     uuid        NOT NULL REFERENCES finance_spaces (id),
  import_job_id        uuid        NOT NULL,
  extracted_record_id  uuid        NOT NULL,
  transaction_id       uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  deleted_at           timestamptz,
  deleted_by           uuid,
  CONSTRAINT itl_import_job_fk FOREIGN KEY (import_job_id, finance_space_id)
    REFERENCES import_jobs (id, finance_space_id),
  CONSTRAINT itl_extracted_record_fk FOREIGN KEY (extracted_record_id, finance_space_id)
    REFERENCES extracted_records (id, finance_space_id),
  CONSTRAINT itl_transaction_fk FOREIGN KEY (transaction_id, finance_space_id)
    REFERENCES transactions (id, finance_space_id)
);
-- Satu hasil ekstraksi hanya menjadi satu transaksi, dan sebaliknya
CREATE UNIQUE INDEX itl_extracted_record_uk ON imported_transaction_links (extracted_record_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX itl_transaction_uk ON imported_transaction_links (transaction_id)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- audit_logs (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_space_id  uuid         REFERENCES finance_spaces (id),
  actor_id          uuid         REFERENCES users (id),
  action            varchar(60)  NOT NULL,
  entity_type       varchar(60)  NOT NULL,
  entity_id         uuid,
  metadata          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_space_idx ON audit_logs (finance_space_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Trigger updated_at untuk semua tabel yang memiliki kolom tersebut
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- View bantu: saldo akun saat ini (Saldo = saldo awal + pemasukan + transfer
-- masuk − pengeluaran − transfer keluar), hanya transaksi VALID & tidak dihapus.
-- -----------------------------------------------------------------------------
CREATE VIEW account_balances AS
SELECT
  a.id                AS account_id,
  a.finance_space_id,
  a.name,
  a.type,
  a.is_active,
  a.opening_balance,
  a.opening_balance
    + COALESCE(SUM(CASE
        WHEN t.type = 'INCOME'   AND t.account_id = a.id              THEN t.amount
        WHEN t.type = 'TRANSFER' AND t.destination_account_id = a.id  THEN t.amount
        WHEN t.type = 'EXPENSE'  AND t.account_id = a.id              THEN -t.amount
        WHEN t.type = 'TRANSFER' AND t.account_id = a.id              THEN -t.amount
        ELSE 0 END), 0)  AS balance
FROM accounts a
LEFT JOIN transactions t
  ON (t.account_id = a.id OR t.destination_account_id = a.id)
 AND t.status = 'VALID'
 AND t.deleted_at IS NULL
WHERE a.deleted_at IS NULL
GROUP BY a.id;

COMMIT;
