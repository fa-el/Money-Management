-- =============================================================================
-- RESET: menghapus seluruh objek skema aplikasi. HATI-HATI — semua data hilang.
-- Jalankan lalu eksekusi ulang schema.sql (dan seed.sql bila perlu).
-- =============================================================================
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
