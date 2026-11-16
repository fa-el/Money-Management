export type Role = "OWNER" | "ADMIN" | "EDITOR" | "MEMBER" | "VIEWER";
export type SpaceType = "PERSONAL" | "FAMILY" | "BUSINESS";
export type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

export interface User { id: string; name: string; email: string; createdAt: string }

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  currency: string;
  role: Role;
  memberCount?: number;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: "BANK" | "CASH" | "EWALLET";
  openingBalance: string;
  openingBalanceDate: string;
  isActive: boolean;
  balance: string;
  transactionCount: number;
}

export interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  icon: string | null;
  color: string | null;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: string;
  transactionDate: string;
  description: string | null;
  status: "VALID" | "VOID";
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  recurringTransactionId: string | null;
  createdBy: string;
  createdByName: string | null;
  account: { id: string; name: string; type: string };
  destinationAccount: { id: string; name: string; type: string } | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  importSource?: { importJobId: string; items: { itemName: string; quantity: string; unitPrice: string; lineTotal: string }[] } | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface Budget {
  id: string;
  categoryId: string;
  period: "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate: string;
  endDate: string;
  amount: string;
  spent: string;
  remaining: string;
  usage: number;
  status: "OK" | "WARNING" | "OVER";
  category: { id: string; name: string; icon: string | null; color: string | null };
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: string;
  targetDate: string | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  savedAmount: string;
  remainingAmount: string;
  progress: number;
  contributions: { id: string; amount: string; contributionDate: string; accountId: string; accountName: string | null }[];
}

export interface Recurring {
  id: string;
  type: TxType;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  amount: string;
  description: string | null;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate: string;
  nextExecutionDate: string;
  lastExecutionAt: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface Summary {
  period: { from: string; to: string };
  income: string;
  expense: string;
  net: string;
  transfer: string;
  transactionCount: number;
  totalBalance: string;
  savingsRate: number | null;
  previous: { period: { from: string; to: string }; income: string; expense: string; net: string };
  change: { income: number | null; expense: number | null; net: number | null };
}

export interface Member {
  id: string;
  role: Role;
  status: "ACTIVE" | "INVITED" | "INACTIVE";
  joinedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  financeSpaceId: string | null;
}

export interface ImportRecordData {
  date: string | null;
  description: string;
  type: TxType;
  amount: string | null;
  accountId: string | null;
  categoryId: string | null;
  counterpartAccountId: string | null;
  debit?: string | null;
  credit?: string | null;
  balance?: string | null;
  merchant?: string | null;
  receiptNumber?: string | null;
  paymentMethod?: string | null;
  subtotal?: string | null;
  discount?: string | null;
  tax?: string | null;
  otherFees?: string | null;
  lowConfidenceFields?: string[];
}

export interface ImportRecord {
  id: string;
  recordType: "STATEMENT_LINE" | "RECEIPT" | "OPENING_BALANCE" | "ENDING_BALANCE";
  normalizedData: ImportRecordData;
  confidence: string | null;
  reviewStatus: "PENDING" | "APPROVED" | "IGNORED";
  transactionId: string | null;
  items: { id: string; itemName: string; quantity: string; unitPrice: string; lineTotal: string }[];
  duplicates: { id: string; date: string; amount: string; description: string | null; score: number; alreadyImported: boolean }[];
}

export interface ImportJob {
  id: string;
  sourceType: "RECEIPT" | "E_STATEMENT";
  status: "UPLOADED" | "PROCESSING" | "NEEDS_REVIEW" | "APPROVED" | "IMPORTED" | "FAILED";
  accountId: string | null;
  errorMessage: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  createdBy: string;
  recordCount?: number;
  file: { id?: string; originalName: string; mimeType: string; sizeBytes: string; status?: string };
}

export interface ImportDetail extends ImportJob {
  records: ImportRecord[];
  reconciliation: {
    openingBalance: string | null;
    endingBalance: string | null;
    totalDebit: string;
    totalCredit: string;
    computedEndingBalance: string | null;
    difference: string | null;
    balanced: boolean | null;
  } | null;
  summary: {
    total: number;
    approved: number;
    imported: number;
    approvedIncome: string;
    approvedExpense: string;
    approvedTransfer: string;
    possibleDuplicates: number;
  };
}

export const ROLE_LEVEL: Record<Role, number> = { VIEWER: 1, MEMBER: 2, EDITOR: 3, ADMIN: 4, OWNER: 5 };
export const ROLE_LABEL: Record<Role, string> = { OWNER: "Pemilik", ADMIN: "Admin", EDITOR: "Editor", MEMBER: "Anggota", VIEWER: "Pengamat" };
export const SPACE_LABEL: Record<SpaceType, string> = { PERSONAL: "Pribadi", FAMILY: "Keluarga", BUSINESS: "Bisnis" };
export const TX_LABEL: Record<TxType, string> = { INCOME: "Pemasukan", EXPENSE: "Pengeluaran", TRANSFER: "Transfer" };
export const ACCOUNT_LABEL = { BANK: "Rekening Bank", CASH: "Kas / Tunai", EWALLET: "Dompet Digital" } as const;
export const FREQ_LABEL = { DAILY: "Harian", WEEKLY: "Mingguan", MONTHLY: "Bulanan", YEARLY: "Tahunan" } as const;
