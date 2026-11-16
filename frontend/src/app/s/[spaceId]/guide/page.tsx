"use client";

import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bell,
  FileScan,
  LayoutDashboard,
  Lightbulb,
  PiggyBank,
  Repeat,
  Rocket,
  Settings,
  ShieldCheck,
  Tags,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSpace } from "@/components/space-context";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { ROLE_LABEL, SPACE_LABEL, type Role } from "@/lib/types";

interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Path relatif terhadap ruang aktif, mis. "/transactions" */
  path?: string;
  /** Role minimum untuk melakukan aksi utama di bagian ini */
  minRole?: Role;
  intro: ReactNode;
  steps?: { title: string; body: ReactNode }[];
  tips?: ReactNode[];
  extra?: ReactNode;
}

const ROLE_ROWS: { role: Role; can: string }[] = [
  { role: "OWNER", can: "Akses penuh: semua data, anggota & role, pengaturan, menghapus ruang, mengalihkan kepemilikan." },
  { role: "ADMIN", can: "Mengelola anggota (di bawah Admin) dan seluruh data operasional; melihat audit log." },
  { role: "EDITOR", can: "Mengelola akun, kategori, anggaran, target, transaksi berulang, dan semua transaksi. (Ruang Bisnis)" },
  { role: "MEMBER", can: "Melihat data dan mencatat transaksi; hanya bisa mengubah/menghapus transaksi buatannya sendiri. (Ruang Keluarga)" },
  { role: "VIEWER", can: "Hanya melihat dashboard, transaksi, dan laporan." },
];

const SECTIONS: Section[] = [
  {
    id: "mulai",
    title: "Mulai cepat",
    icon: Rocket,
    intro: "Lima langkah agar ruang keuangan siap dipakai sehari-hari.",
    steps: [
      { title: "Buat ruang keuangan", body: <>Di halaman <b>Ruang Keuangan</b> (klik logo di kiri atas), pilih tipe <b>Pribadi</b>, <b>Keluarga</b>, atau <b>Bisnis</b>. Kategori bawaan sesuai tipe ruang langsung disiapkan.</> },
      { title: "Tambahkan akun", body: <>Buka menu <b>Akun</b>, tambahkan rekening bank, kas tunai, atau dompet digital beserta <b>saldo awal</b> dan <b>tanggal saldo awal</b>-nya.</> },
      { title: "Periksa kategori", body: <>Buka <b>Kategori</b> untuk mengganti nama, ikon, atau warna kategori bawaan, atau menambah kategori baru.</> },
      { title: "Catat transaksi", body: <>Klik <b>+ Transaksi</b> di Dashboard atau <b>Catat transaksi</b> di menu Transaksi. Atau impor otomatis lewat <b>Smart Import</b>.</> },
      { title: "Pantau & rencanakan", body: <>Lihat ringkasan di <b>Dashboard</b>, buat <b>Anggaran</b> per kategori, dan tetapkan <b>Target Tabungan</b>.</> },
    ],
  },
  {
    id: "ruang",
    title: "Ruang keuangan",
    icon: LayoutDashboard,
    intro: (
      <>
        Satu akun pengguna dapat memiliki atau bergabung ke banyak ruang. Data setiap ruang (akun, kategori, transaksi, anggaran,
        laporan, anggota) <b>terpisah sepenuhnya</b> dan tidak tercampur.
      </>
    ),
    steps: [
      { title: "Berpindah ruang", body: <>Klik nama ruang di bagian atas sidebar, lalu pilih ruang lain. Pilih <b>Kelola / buat ruang baru</b> untuk kembali ke daftar ruang.</> },
      { title: "Tipe ruang", body: <><b>Pribadi</b> untuk satu orang (tanpa anggota). <b>Keluarga</b> dan <b>Bisnis</b> mendukung anggota dengan role berbeda.</> },
      { title: "Menerima undangan", body: <>Undangan dari pengguna lain muncul di halaman <b>Ruang Keuangan</b> dan di lonceng notifikasi. Klik <b>Terima</b> untuk bergabung.</> },
    ],
  },
  {
    id: "akun",
    title: "Akun",
    icon: Wallet,
    path: "/accounts",
    minRole: "EDITOR",
    intro: "Akun adalah tempat uang berada: rekening bank, kas tunai, atau dompet digital (GoPay, OVO, dll).",
    steps: [
      { title: "Tambah akun", body: <>Klik <b>Tambah akun</b>, isi nama, jenis, saldo awal, dan tanggal saldo awal. Saldo awal boleh negatif untuk utang/kartu kredit.</> },
      { title: "Cara saldo dihitung", body: <>Saldo = saldo awal + pemasukan + transfer masuk − pengeluaran − transfer keluar. Saldo dihitung otomatis dari transaksi, jadi tidak perlu diubah manual.</> },
      { title: "Nonaktifkan akun", body: <>Akun yang sudah tidak dipakai bisa dinonaktifkan lewat <b>Ubah</b>. Akun nonaktif tidak dihitung di total saldo dan tidak bisa dipakai untuk transaksi baru.</> },
    ],
    tips: [
      <>Transaksi tidak bisa dicatat <b>sebelum tanggal saldo awal</b> akun. Bila perlu mencatat transaksi lama, mundurkan tanggal saldo awalnya.</>,
      <>Akun yang sudah punya transaksi tidak bisa dihapus — nonaktifkan saja agar riwayat tetap utuh.</>,
    ],
  },
  {
    id: "kategori",
    title: "Kategori",
    icon: Tags,
    path: "/categories",
    minRole: "EDITOR",
    intro: "Kategori mengelompokkan pemasukan dan pengeluaran sehingga laporan dan anggaran lebih bermakna.",
    steps: [
      { title: "Pilih tab", body: <>Gunakan tab <b>Pengeluaran</b> / <b>Pemasukan</b> untuk melihat kategori sesuai jenisnya.</> },
      { title: "Tambah atau ubah", body: <>Atur nama, ikon, dan warna. Nama kategori harus unik untuk jenis yang sama.</> },
    ],
    tips: [<>Kategori yang sudah dipakai transaksi atau anggaran tidak bisa dihapus — nonaktifkan agar tidak muncul di pilihan baru.</>],
  },
  {
    id: "transaksi",
    title: "Transaksi",
    icon: ArrowLeftRight,
    path: "/transactions",
    minRole: "MEMBER",
    intro: "Semua pemasukan, pengeluaran, dan transfer antar-akun dicatat di sini.",
    steps: [
      { title: "Catat pemasukan / pengeluaran", body: <>Klik <b>Catat transaksi</b>, pilih jenis, isi nominal, akun, kategori, tanggal & waktu, serta keterangan (opsional).</> },
      { title: "Catat transfer", body: <>Pilih jenis <b>Transfer</b>, lalu akun asal dan akun tujuan (harus berbeda). Contoh: tarik tunai dari rekening ke dompet, atau top-up e-wallet. Transfer <b>tidak dihitung</b> sebagai pemasukan maupun pengeluaran.</> },
      { title: "Lihat, ubah, batalkan, hapus", body: <>Klik sebuah transaksi untuk melihat detail. <b>Ubah</b> untuk mengoreksi, <b>Batalkan (void)</b> agar tetap tersimpan tapi tidak dihitung, atau <b>Hapus</b>. Saldo selalu dihitung ulang otomatis.</> },
      { title: "Cari & filter", body: <>Gunakan tab jenis, kolom pencarian keterangan, filter akun, kategori, rentang tanggal, dan status.</> },
      { title: "Export", body: <>Klik <b>Export CSV</b> untuk mengunduh transaksi sesuai filter aktif (bisa dibuka di Excel/Google Sheets).</> },
    ],
    tips: [
      <>Role <b>Anggota</b> hanya dapat mengubah/menghapus transaksi yang dibuatnya sendiri.</>,
      <>Ikon <Repeat className="inline h-3.5 w-3.5" /> menandai transaksi yang dibuat otomatis dari jadwal berulang.</>,
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    path: "",
    intro: "Ringkasan kondisi keuangan ruang dalam satu layar.",
    steps: [
      { title: "Pilih periode", body: <>Gunakan tombol <b>Hari ini</b>, <b>Bulan ini</b>, <b>Bulan lalu</b>, atau <b>Tahun ini</b>.</> },
      { title: "Baca kartu ringkasan", body: <>Total saldo, pemasukan, pengeluaran, dan selisih — lengkap dengan persentase perubahan dibanding periode sebelumnya dan rasio tabungan.</> },
      { title: "Grafik & daftar", body: <>Tren arus kas (biru = pemasukan, oranye = pengeluaran), pengeluaran per kategori, transaksi terbaru, saldo per akun, dan status anggaran aktif.</> },
    ],
  },
  {
    id: "anggaran",
    title: "Anggaran",
    icon: PiggyBank,
    path: "/budgets",
    minRole: "EDITOR",
    intro: "Tetapkan batas pengeluaran per kategori untuk periode mingguan, bulanan, atau tahunan.",
    steps: [
      { title: "Buat anggaran", body: <>Klik <b>Anggaran baru</b>, pilih kategori pengeluaran, periode, tanggal mulai, dan nominal batas. Tanggal akhir dihitung otomatis bila dikosongkan.</> },
      { title: "Pantau realisasi", body: <>Setiap anggaran menampilkan jumlah terpakai, sisa, dan persentase. Status <Badge color="green">Aman</Badge> <Badge color="amber">Hampir habis</Badge> (≥ 80%) <Badge color="red">Terlampaui</Badge> (&gt; 100%).</> },
      { title: "Notifikasi otomatis", body: <>Pemilik/Admin dan pencatat transaksi menerima notifikasi saat pemakaian melewati 80% dan 100%.</> },
    ],
    tips: [<>Satu kategori hanya boleh punya satu anggaran pada periode yang sama. Klik <b>Tampilkan semua</b> untuk melihat anggaran periode lalu.</>],
  },
  {
    id: "tabungan",
    title: "Target tabungan",
    icon: Target,
    path: "/goals",
    minRole: "EDITOR",
    intro: "Rencanakan tujuan menabung seperti dana darurat, liburan, atau DP rumah.",
    steps: [
      { title: "Buat target", body: <>Isi nama, nominal target, dan tanggal target (opsional).</> },
      { title: "Tambah kontribusi", body: <>Klik <b>Tambah kontribusi</b>, pilih akun sumber dana, nominal, dan tanggal. Anggota (role Member ke atas) juga dapat berkontribusi.</> },
      { title: "Progres", body: <>Progres dan sisa kekurangan dihitung otomatis. Target ditandai <b>Tercapai</b> begitu total kontribusi mencapai nominal target.</> },
    ],
    tips: [<>Kontribusi adalah <b>penanda alokasi dana</b> dan tidak mengubah saldo akun. Jika uang benar-benar dipindahkan ke rekening tabungan, catat juga sebagai <b>Transfer</b>.</>],
  },
  {
    id: "berulang",
    title: "Transaksi berulang",
    icon: Repeat,
    path: "/recurring",
    minRole: "EDITOR",
    intro: "Jadwalkan transaksi rutin (gaji, tagihan, cicilan, iuran) agar tercatat otomatis.",
    steps: [
      { title: "Buat jadwal", body: <>Klik <b>Jadwal baru</b>, pilih jenis, akun, kategori (atau akun tujuan untuk transfer), nominal, frekuensi (harian/mingguan/bulanan/tahunan), tanggal mulai, dan tanggal berakhir (opsional).</> },
      { title: "Eksekusi otomatis", body: <>Sistem membuat transaksi setiap hari pukul 00:05 WIB untuk jadwal yang jatuh tempo, termasuk mengejar tanggal yang terlewat. Tanggal mulai yang sudah lewat langsung diproses saat jadwal dibuat.</> },
      { title: "Kelola", body: <>Gunakan <b>Jeda</b>/<b>Aktifkan</b>, tombol ▶ untuk memproses sekarang, atau <b>Ubah</b> untuk mengganti nominal, kategori, dan tanggal berakhir.</> },
    ],
    tips: [<>Jadwal tanggal 31 tetap berjalan di bulan pendek (jatuh di tanggal terakhir bulan itu). Setiap tanggal hanya dibuat satu kali, jadi tidak ada transaksi ganda.</>],
  },
  {
    id: "laporan",
    title: "Laporan",
    icon: BarChart3,
    path: "/reports",
    intro: "Evaluasi arus kas dengan filter dan perbandingan antarperiode.",
    steps: [
      { title: "Atur filter", body: <>Pilih preset (Bulan ini, Bulan lalu, 3 bulan, Tahun ini) atau isi rentang tanggal sendiri. Filter berdasarkan akun, kategori, dan pengelompokan (harian, mingguan, bulanan, tahunan).</> },
      { title: "Baca hasil", body: <>Ringkasan dengan perbandingan periode sebelumnya, grafik arus kas, komposisi per kategori (pengeluaran/pemasukan), dan tabel per akun berisi saldo awal, uang masuk, uang keluar, dan saldo akhir periode.</> },
      { title: "Export", body: <>Klik <b>Export CSV</b> untuk mengunduh transaksi valid sesuai filter laporan.</> },
    ],
  },
  {
    id: "import",
    title: "Smart Import",
    icon: FileScan,
    path: "/import",
    minRole: "MEMBER",
    intro: "Baca struk belanja dan e-statement rekening, periksa hasilnya, lalu impor menjadi transaksi. Tidak ada transaksi yang dibuat tanpa persetujuan Anda.",
    steps: [
      { title: "Unggah dokumen", body: <>Pilih <b>Struk / Bon</b> (JPG, PNG, WEBP, PDF) atau <b>E-statement</b> (CSV, XLSX; PDF bila ekstraksi otomatis aktif). Pilih akun bila sudah tahu, lalu seret file atau klik untuk memilih, kemudian <b>Unggah & proses</b>.</> },
      { title: "Review struk", body: <>Pratinjau struk tampil di kiri. Periksa merchant, tanggal, total, akun, kategori, dan rincian item. Field bertanda merah perlu diperiksa karena pembacaan kurang yakin. Klik <b>Simpan & setujui</b>.</> },
      { title: "Review e-statement", body: <>Pilih <b>akun rekening</b>. Untuk setiap baris, periksa jenis (debit → pengeluaran, kredit → pemasukan), kategori (ada saran otomatis), atau ubah menjadi <b>Transfer</b> lalu pilih akun lawannya. Gunakan kotak centang untuk <b>Setujui</b>, <b>Abaikan</b>, atau <b>Set kategori</b> sekaligus.</> },
      { title: "Cek duplikat & rekonsiliasi", body: <>Baris bertanda ⚠ mirip transaksi yang sudah ada (nominal sama, tanggal berdekatan) — abaikan bila memang sudah tercatat. Panel <b>Rekonsiliasi saldo</b> membandingkan saldo awal + kredit − debit dengan saldo akhir dokumen; selisih ditampilkan apa adanya.</> },
      { title: "Impor", body: <>Klik <b>Impor N transaksi</b>, periksa ringkasan, lalu konfirmasi. Transaksi hasil impor tetap terhubung ke dokumen sumbernya (lihat detail transaksi).</> },
    ],
    tips: [
      <>Unduh mutasi dalam format <b>CSV/XLSX</b> dari internet banking untuk hasil paling akurat. File contoh tersedia di folder <code>samples/</code> repo.</>,
      <>PDF yang dilindungi password harus dibuka proteksinya di perangkat Anda terlebih dahulu.</>,
      <>Foto struk dibaca otomatis bila OCR lokal (PaddleOCR) atau AI aktif. Hasil terbaik: foto tegak lurus, terang, tidak buram, dan seluruh struk masuk bingkai. Angka biasanya akurat; nama barang kadang salah satu-dua huruf — koreksi saat review.</>,
      <>Gunakan tombol <b>↻</b> untuk membaca ulang dokumen dan tombol hapus untuk menghapus dokumen sumber — transaksi yang sudah diimpor tetap tersimpan.</>,
    ],
    extra: (
      <div className="mt-4 flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Dokumen disimpan privat dan hanya bisa dibuka anggota ruang ini. Aplikasi <b>tidak pernah</b> meminta username, password, PIN, OTP, atau token mobile banking. Nomor rekening pada hasil
          bacaan ditampilkan tersamarkan.
        </span>
      </div>
    ),
  },
  {
    id: "anggota",
    title: "Anggota & hak akses",
    icon: Users,
    path: "/members",
    minRole: "ADMIN",
    intro: "Untuk ruang Keluarga dan Bisnis: kolaborasi dengan hak akses berbeda (prinsip hak minimum).",
    steps: [
      { title: "Undang anggota", body: <>Klik <b>Undang anggota</b>, masukkan email pengguna yang <b>sudah terdaftar</b>, dan pilih role. Pengguna tersebut menerima notifikasi dan dapat menerima/menolak.</> },
      { title: "Ubah role / keluarkan", body: <>Pemilik/Admin dapat mengubah role atau mengeluarkan anggota yang role-nya lebih rendah. Undangan yang belum dijawab bisa dibatalkan.</> },
      { title: "Alihkan kepemilikan", body: <>Pemilik dapat menjadikan anggota aktif lain sebagai pemilik; role pemilik lama menjadi Admin.</> },
      { title: "Keluar dari ruang", body: <>Anggota selain pemilik dapat keluar lewat tombol <b>Keluar dari ruang</b>.</> },
    ],
    extra: (
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {ROLE_ROWS.map((r) => (
              <tr key={r.role}>
                <td className="w-28 bg-slate-50 px-3 py-2 align-top font-medium">{ROLE_LABEL[r.role]}</td>
                <td className="px-3 py-2 text-slate-600">{r.can}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Role tersedia — Keluarga: Admin, Anggota, Pengamat · Bisnis: Admin, Editor, Pengamat · Pribadi: tanpa anggota.
        </p>
      </div>
    ),
  },
  {
    id: "pengaturan",
    title: "Pengaturan & audit log",
    icon: Settings,
    path: "/settings",
    minRole: "ADMIN",
    intro: "Kelola informasi ruang dan telusuri riwayat aktivitas.",
    steps: [
      { title: "Ubah nama ruang", body: <>Pemilik/Admin dapat mengganti nama ruang. Tipe ruang tidak dapat diubah.</> },
      { title: "Audit log", body: <>Pemilik/Admin dapat melihat siapa melakukan apa dan kapan: pencatatan & perubahan transaksi, perubahan anggota, unggah & impor dokumen, dsb.</> },
      { title: "Hapus ruang", body: <>Hanya Pemilik. Ketik nama ruang untuk konfirmasi; ruang disembunyikan dari semua anggota.</> },
    ],
  },
  {
    id: "akun-saya",
    title: "Profil, keamanan & notifikasi",
    icon: Bell,
    intro: "Pengaturan pribadi yang berlaku di semua ruang.",
    steps: [
      { title: "Profil & password", body: <>Klik avatar di kanan atas → <b>Profil & keamanan</b>. Setelah mengubah password, sesi di perangkat lain otomatis dikeluarkan.</> },
      { title: "Notifikasi", body: <>Ikon lonceng menampilkan undangan, perubahan role, peringatan anggaran, dan target tabungan tercapai. Klik untuk menandai dibaca.</> },
      { title: "Keluar", body: <>Klik avatar → <b>Keluar</b>. Sesi login berlaku 7 hari bila tidak keluar.</> },
    ],
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  { q: "Kenapa saldo akun berubah setelah saya mengubah transaksi lama?", a: "Saldo selalu dihitung ulang dari seluruh transaksi valid. Itu memastikan saldo konsisten setelah transaksi diubah, dibatalkan, atau dihapus." },
  { q: "Apa beda “Batalkan (void)” dan “Hapus”?", a: "Void tetap menampilkan transaksi (dicoret) sebagai jejak, tetapi tidak dihitung. Hapus menyembunyikannya dari daftar. Keduanya tercatat di audit log dan saldo dihitung ulang." },
  { q: "Apakah saldo boleh minus?", a: "Boleh. Aplikasi tidak memblokir transaksi yang membuat saldo negatif, sehingga utang atau cerukan tetap bisa dicatat." },
  { q: "Mengapa transaksi saya ditolak dengan pesan tanggal saldo awal?", a: "Tanggal transaksi lebih awal dari tanggal saldo awal akun. Mundurkan tanggal saldo awal di menu Akun bila perlu mencatat transaksi lama." },
  { q: "Apakah transfer masuk ke laporan pemasukan/pengeluaran?", a: "Tidak. Transfer hanya memindahkan saldo antar-akun dalam ruang yang sama." },
  { q: "Teman saya tidak bisa diundang.", a: "Pastikan dia sudah mendaftar dengan email yang sama, dan ruang bertipe Keluarga atau Bisnis." },
];

export default function GuidePage() {
  const { space, can } = useSpace();
  const base = `/s/${space.id}`;
  const sections = SECTIONS.filter((s) => s.id !== "anggota" || space.type !== "PERSONAL");

  return (
    <>
      <PageHeader
        title="Panduan Penggunaan"
        description={
          <>
            Tutorial lengkap seluruh fitur. Anda membuka ruang <b>{space.name}</b> ({SPACE_LABEL[space.type]}) sebagai <b>{ROLE_LABEL[space.role]}</b>.
          </>
        }
      />
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <nav className="mb-6 lg:mb-0" aria-label="Daftar isi">
          <div className="lg:sticky lg:top-20">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Daftar isi</p>
            <ol className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-white hover:text-slate-900 lg:ring-0">
                    <span className="w-5 text-right text-xs text-slate-400">{i + 1}.</span>
                    {s.title}
                  </a>
                </li>
              ))}
              <li>
                <a href="#faq" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-white hover:text-slate-900 lg:ring-0">
                  <span className="w-5 text-right text-xs text-slate-400">?</span>
                  Pertanyaan umum
                </a>
              </li>
            </ol>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {sections.map((s, i) => {
            const allowed = !s.minRole || can(s.minRole);
            return (
              <Card key={s.id} className="scroll-mt-20 p-5 sm:p-6">
                <section id={s.id} className="scroll-mt-20">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <s.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-xs text-slate-400">Bagian {i + 1}</p>
                        <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.minRole && (
                        <Badge color={allowed ? "green" : "slate"}>{allowed ? "Anda dapat mengelola" : `Butuh role ${ROLE_LABEL[s.minRole]}`}</Badge>
                      )}
                      {s.path !== undefined && (
                        <Link href={`${base}${s.path}`} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline">
                          Buka menu <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{s.intro}</p>

                  {s.steps && (
                    <ol className="mt-4 space-y-3">
                      {s.steps.map((step, idx) => (
                        <li key={step.title} className="flex gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{idx + 1}</span>
                          <div className="text-sm">
                            <p className="font-medium text-slate-800">{step.title}</p>
                            <p className="mt-0.5 text-slate-600">{step.body}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  {s.extra}

                  {s.tips && (
                    <div className="mt-4 space-y-1.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      {s.tips.map((tip, idx) => (
                        <p key={idx} className="flex gap-2">
                          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{tip}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </section>
              </Card>
            );
          })}

          <Card className="p-5 sm:p-6">
            <section id="faq" className="scroll-mt-20">
              <h2 className="text-lg font-semibold text-slate-900">Pertanyaan umum</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {FAQ.map((f) => (
                  <details key={f.q} className="group py-3">
                    <summary className={cn("cursor-pointer list-none text-sm font-medium text-slate-800", "flex items-center justify-between gap-2")}>
                      {f.q}
                      <span className="text-slate-400 transition group-open:rotate-90">›</span>
                    </summary>
                    <p className="mt-2 text-sm text-slate-600">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          </Card>
        </div>
      </div>
    </>
  );
}
