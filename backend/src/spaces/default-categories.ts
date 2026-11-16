import type { CategoryType, SpaceType } from '@prisma/client';

type Def = { name: string; type: CategoryType; icon: string; color: string };

const income = (name: string, icon: string, color: string): Def => ({ name, type: 'INCOME', icon, color });
const expense = (name: string, icon: string, color: string): Def => ({ name, type: 'EXPENSE', icon, color });

/** Template kategori bawaan per tipe ruang (bagian 9.3 dokumen perencanaan). Dapat diubah pengguna. */
export const DEFAULT_CATEGORIES: Record<SpaceType, Def[]> = {
  PERSONAL: [
    income('Gaji', '💼', '#16a34a'),
    income('Bonus', '🎁', '#22c55e'),
    income('Hadiah', '🎉', '#84cc16'),
    income('Pendapatan lain', '➕', '#10b981'),
    expense('Makanan', '🍽️', '#ef4444'),
    expense('Jajan', '🧋', '#f97316'),
    expense('Transportasi', '🚗', '#eab308'),
    expense('Hiburan', '🎬', '#a855f7'),
    expense('Kesehatan', '💊', '#ec4899'),
    expense('Cicilan', '🏦', '#6366f1'),
    expense('Tagihan', '🧾', '#0ea5e9'),
    expense('Belanja', '🛒', '#14b8a6'),
  ],
  FAMILY: [
    income('Gaji', '💼', '#16a34a'),
    income('Bonus', '🎁', '#22c55e'),
    income('Hadiah', '🎉', '#84cc16'),
    income('Pendapatan lain', '➕', '#10b981'),
    expense('Belanja Rumah Tangga', '🛒', '#14b8a6'),
    expense('Makanan', '🍽️', '#ef4444'),
    expense('Pendidikan', '🎓', '#3b82f6'),
    expense('Transportasi', '🚗', '#eab308'),
    expense('Kesehatan', '💊', '#ec4899'),
    expense('Tagihan', '🧾', '#0ea5e9'),
    expense('Cicilan', '🏦', '#6366f1'),
    expense('Hiburan', '🎬', '#a855f7'),
  ],
  BUSINESS: [
    income('Penjualan', '🧾', '#16a34a'),
    income('Modal', '💰', '#22c55e'),
    income('Pendapatan lain', '➕', '#10b981'),
    expense('Operasional', '⚙️', '#64748b'),
    expense('Bahan Baku', '📦', '#f97316'),
    expense('Gaji Karyawan', '👥', '#6366f1'),
    expense('Sewa', '🏢', '#0ea5e9'),
    expense('Transportasi', '🚚', '#eab308'),
    expense('Tagihan', '💡', '#06b6d4'),
    expense('Pemasaran', '📣', '#ec4899'),
    expense('Prive (penarikan pemilik)', '👤', '#ef4444'),
  ],
};
