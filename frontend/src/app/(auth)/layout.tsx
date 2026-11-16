import { Wallet as WalletIcon } from "lucide-react";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white"><WalletIcon className="h-6 w-6" /></span>
          <h1 className="text-2xl font-semibold text-slate-900">Catat Keuangan</h1>
          <p className="mt-1 text-sm text-slate-500">Pribadi · Keluarga · Bisnis dalam satu aplikasi</p>
        </div>
        {children}
      </div>
    </div>
  );
}
