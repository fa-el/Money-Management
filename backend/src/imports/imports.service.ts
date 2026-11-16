import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type ExtractedRecord, type ImportJob, type SpaceMember } from '@prisma/client';
import { createHash } from 'crypto';
import { extname } from 'path';
import { AuditService } from '../audit/audit.service';
import { hasRole, type AuthUser } from '../common/types';
import { addPeriod, localDateString, maskAccountNumbers, paginate, toDateOnly } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { localStartOfDay, TransactionsService } from '../transactions/transactions.service';
import { ClaudeExtractor } from './extractors/claude.extractor';
import { BulkUpdateRecordsDto, UpdateRecordDto, UploadImportDto } from './imports.dto';
import { normalizeDescription, parseAmount, parseDate } from './parsers/normalize';
import { readCsv, readXlsx } from './parsers/spreadsheet';
import { parseStatementTable, type ParsedStatement } from './parsers/statement-table';
import { StorageService } from './storage.service';

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);
const MAX_PDF_PAGES = 50;

type FileKind = 'pdf' | 'jpeg' | 'png' | 'webp' | 'csv' | 'xlsx';

const KIND_MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const ALLOWED: Record<'RECEIPT' | 'E_STATEMENT', FileKind[]> = {
  RECEIPT: ['jpeg', 'png', 'webp', 'pdf'],
  E_STATEMENT: ['pdf', 'csv', 'xlsx'],
};

/** Data hasil ekstraksi yang sudah dinormalisasi & dapat dikoreksi pengguna. */
export interface NormalizedRecord {
  date: string | null;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: string | null;
  accountId: string | null;
  categoryId: string | null;
  counterpartAccountId: string | null;
  // e-statement
  debit?: string | null;
  credit?: string | null;
  balance?: string | null;
  // struk
  merchant?: string | null;
  receiptNumber?: string | null;
  paymentMethod?: string | null;
  subtotal?: string | null;
  discount?: string | null;
  tax?: string | null;
  otherFees?: string | null;
  lowConfidenceFields?: string[];
}

/** Kata kunci sederhana untuk SARAN kategori (pengguna tetap memutuskan). */
const CATEGORY_HINTS: [RegExp, string[]][] = [
  [/gaji|payroll|salary/, ['gaji']],
  [/bunga|interest/, ['pendapatan lain', 'bunga']],
  [/biaya adm|adm(in)? fee|biaya admin|biaya bulanan|monthly fee|pajak|tax/, ['tagihan', 'operasional', 'biaya bank']],
  [/pln|listrik|token|pdam|telkom|indihome|internet|pulsa|bpjs|tagihan/, ['tagihan']],
  [/grab|gojek|gocar|goride|ojek|maxim|transjakarta|krl|mrt|tol|pertamina|spbu|parkir|bensin/, ['transportasi']],
  [/indomaret|alfamart|alfamidi|superindo|hypermart|transmart|lottemart|supermarket|minimarket|belanja/, ['belanja', 'belanja rumah tangga']],
  [/resto|restoran|cafe|kopi|coffee|starbucks|kfc|mcd|mcdonald|bakso|warung|makan|food|gofood|grabfood|shopeefood/, ['makanan', 'jajan']],
  [/apotek|apotik|klinik|rumah sakit|rs |dokter|kimia farma|guardian/, ['kesehatan']],
  [/netflix|spotify|bioskop|cgv|xxi|cinema|game|steam/, ['hiburan']],
  [/cicilan|angsuran|kredit|kpr|leasing|paylater/, ['cicilan']],
  [/sekolah|kuliah|spp|kursus|les /, ['pendidikan']],
];

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly extractor: ClaudeExtractor,
    private readonly transactions: TransactionsService,
  ) {}

  capabilities() {
    return {
      aiExtraction: this.extractor.enabled,
      maxUploadMb: MAX_UPLOAD_MB,
      receiptFormats: ['JPG', 'PNG', 'WEBP', 'PDF'],
      statementFormats: this.extractor.enabled ? ['CSV', 'XLSX', 'PDF'] : ['CSV', 'XLSX'],
    };
  }

  // ---------------------------------------------------------------------------
  // Upload & validasi file
  // ---------------------------------------------------------------------------

  private detectKind(buffer: Buffer, originalName: string): FileKind {
    const ext = extname(originalName).toLowerCase();
    const head = buffer.subarray(0, 16);
    if (head.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
    const ftyp = head.subarray(4, 12).toString('latin1');
    if (/^ftyp(heic|heix|hevc|heif|mif1|msf1)/.test(ftyp)) {
      throw new BadRequestException('Format HEIC belum didukung. Ubah foto ke JPG/PNG terlebih dahulu (mis. lewat fitur "Export"/"Simpan sebagai JPG").');
    }
    if (head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && ext === '.xlsx') return 'xlsx';
    if ((ext === '.csv' || ext === '.txt') && !buffer.subarray(0, 4096).includes(0)) return 'csv';
    if (ext === '.xls') throw new BadRequestException('Format .xls lama belum didukung. Simpan ulang sebagai .xlsx atau .csv.');
    throw new BadRequestException('Jenis file tidak didukung atau file rusak.');
  }

  private validatePdf(buffer: Buffer) {
    const text = buffer.toString('latin1');
    if (/\/Encrypt\b/.test(text)) {
      throw new BadRequestException(
        'PDF dilindungi password. Buka proteksinya terlebih dahulu di perangkat Anda, lalu unggah ulang. Aplikasi tidak pernah meminta password/PIN bank.',
      );
    }
    const pages = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    if (pages > MAX_PDF_PAGES) throw new BadRequestException(`PDF terlalu banyak halaman (${pages}). Maksimal ${MAX_PDF_PAGES} halaman.`);
    if (!/%%EOF\s*$/.test(text.slice(-1024))) throw new BadRequestException('File PDF tampaknya rusak atau tidak lengkap.');
  }

  async upload(user: AuthUser, spaceId: string, dto: UploadImportDto, file?: Express.Multer.File) {
    if (!file || !file.buffer?.length) throw new BadRequestException('File wajib diunggah');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new BadRequestException(`Ukuran file maksimal ${MAX_UPLOAD_MB} MB`);

    const kind = this.detectKind(file.buffer, file.originalname);
    if (!ALLOWED[dto.sourceType].includes(kind)) {
      throw new BadRequestException(
        dto.sourceType === 'RECEIPT'
          ? 'Struk harus berupa foto JPG/PNG/WEBP atau PDF.'
          : 'E-statement harus berupa CSV, XLSX, atau PDF.',
      );
    }
    if (kind === 'pdf') this.validatePdf(file.buffer);
    if (dto.sourceType === 'E_STATEMENT' && kind === 'pdf' && !this.extractor.enabled) {
      throw new BadRequestException(
        'Pembacaan PDF e-statement memerlukan ekstraktor otomatis yang belum diaktifkan. Unduh mutasi dalam format CSV/XLSX dari internet banking.',
      );
    }
    if (dto.accountId) {
      const acc = await this.prisma.account.findFirst({ where: { id: dto.accountId, financeSpaceId: spaceId, deletedAt: null } });
      if (!acc) throw new BadRequestException('Akun tidak ditemukan di ruang ini');
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const previous = await this.prisma.importJob.findFirst({
      where: { financeSpaceId: spaceId, deletedAt: null, file: { checksum } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, status: true },
    });

    const storageKey = await this.storage.save(file.buffer, `.${kind}`);
    const job = await this.prisma.$transaction(async (tx) => {
      const f = await tx.importFile.create({
        data: {
          storageKey,
          originalName: file.originalname.slice(0, 255),
          mimeType: KIND_MIME[kind],
          sizeBytes: BigInt(file.size),
          checksum,
          createdBy: user.id,
        },
      });
      const job = await tx.importJob.create({
        data: {
          financeSpaceId: spaceId,
          sourceType: dto.sourceType,
          accountId: dto.accountId ?? null,
          fileId: f.id,
          createdBy: user.id,
        },
      });
      await this.audit.log(
        {
          spaceId,
          actorId: user.id,
          action: 'import.upload',
          entityType: 'import_job',
          entityId: job.id,
          metadata: { sourceType: dto.sourceType, fileName: file.originalname, size: file.size, checksum },
        },
        tx,
      );
      return job;
    });

    // Diproses di latar belakang; frontend melakukan polling status job
    setImmediate(() => void this.process(job.id));

    return {
      ...job,
      warnings: previous
        ? [`File yang sama pernah diunggah pada ${localDateString(previous.createdAt)} (status ${previous.status}). Periksa kemungkinan duplikasi.`]
        : [],
      duplicateOfJobId: previous?.id ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Pemrosesan / ekstraksi
  // ---------------------------------------------------------------------------

  async process(jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId }, include: { file: true } });
    if (!job || job.deletedAt) return;
    await this.prisma.$transaction([
      this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', errorMessage: null } }),
      this.prisma.importFile.update({ where: { id: job.fileId }, data: { status: 'PROCESSING' } }),
    ]);
    try {
      const buffer = await this.storage.read(job.file.storageKey);
      const categories = await this.prisma.category.findMany({
        where: { financeSpaceId: job.financeSpaceId, deletedAt: null, isActive: true },
      });
      // Hapus hasil ekstraksi lama (untuk proses ulang) yang belum menjadi transaksi
      await this.prisma.extractedRecord.updateMany({
        where: { importJobId: jobId, deletedAt: null, links: { none: { deletedAt: null } } },
        data: { deletedAt: new Date() },
      });

      let note: string | null = null;
      if (job.sourceType === 'E_STATEMENT') {
        const parsed = await this.parseStatement(job.file.mimeType, buffer);
        await this.saveStatement(job, parsed, categories);
        if (parsed.warnings.length) note = parsed.warnings.slice(0, 5).join(' ');
      } else {
        note = await this.saveReceipt(job, job.file.mimeType, buffer, categories);
      }

      await this.prisma.$transaction([
        this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'NEEDS_REVIEW', errorMessage: note } }),
        this.prisma.importFile.update({ where: { id: job.fileId }, data: { status: 'READY' } }),
      ]);
    } catch (e) {
      this.logger.warn(`Import ${jobId} gagal: ${e.message}`);
      await this.prisma.$transaction([
        this.prisma.importJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', errorMessage: String(e.message ?? e).slice(0, 1000) },
        }),
        this.prisma.importFile.update({ where: { id: job.fileId }, data: { status: 'ERROR' } }),
      ]);
    }
  }

  private async parseStatement(mimeType: string, buffer: Buffer): Promise<ParsedStatement & { confidence: number }> {
    if (mimeType === KIND_MIME.csv) return { ...parseStatementTable(readCsv(buffer)), confidence: 0.9 };
    if (mimeType === KIND_MIME.xlsx) return { ...parseStatementTable(await readXlsx(buffer)), confidence: 0.9 };
    const result = await this.extractor.extractStatement({ mimeType, data: buffer });
    const year = Number((result.period_end ?? result.period_start ?? new Date().toISOString()).slice(0, 4));
    return {
      lines: result.lines.map((l, i) => ({
        rowIndex: i,
        kind: 'LINE' as const,
        date: parseDate(l.date, year),
        description: maskAccountNumbers(l.description),
        debit: l.debit ? parseAmount(l.debit) : null,
        credit: l.credit ? parseAmount(l.credit) : null,
        balance: l.balance !== null ? Number(l.balance).toFixed(2) : null,
        raw: { ...l, description: maskAccountNumbers(l.description) },
      })),
      openingBalance: result.opening_balance !== null ? Number(result.opening_balance).toFixed(2) : null,
      endingBalance: result.ending_balance !== null ? Number(result.ending_balance).toFixed(2) : null,
      periodStart: parseDate(result.period_start),
      periodEnd: parseDate(result.period_end),
      warnings: result.bank_name ? [`Bank terdeteksi: ${result.bank_name}${result.account_number_masked ? ` (${result.account_number_masked})` : ''}.`] : [],
      confidence: Math.max(0, Math.min(1, result.confidence)),
    };
  }

  private suggestCategory(text: string, type: 'INCOME' | 'EXPENSE', categories: { id: string; name: string; type: string }[]) {
    const pool = categories.filter((c) => c.type === type);
    const t = ` ${normalizeDescription(text)} `;
    const direct = pool.find((c) => t.includes(` ${normalizeDescription(c.name)} `));
    if (direct) return direct.id;
    for (const [re, names] of CATEGORY_HINTS) {
      if (!re.test(t)) continue;
      const hit = pool.find((c) => names.includes(c.name.toLowerCase()));
      if (hit) return hit.id;
    }
    return null;
  }

  private async saveStatement(
    job: ImportJob,
    parsed: ParsedStatement & { confidence: number },
    categories: { id: string; name: string; type: string }[],
  ) {
    const records: Prisma.ExtractedRecordCreateManyInput[] = parsed.lines.map((l) => {
      const type = l.debit ? 'EXPENSE' : 'INCOME';
      const data: NormalizedRecord = {
        date: l.date,
        description: l.description,
        type: l.kind === 'LINE' ? type : 'INCOME',
        amount: l.kind === 'LINE' ? l.debit ?? l.credit : null,
        accountId: null,
        categoryId: l.kind === 'LINE' ? this.suggestCategory(l.description, type, categories) : null,
        counterpartAccountId: null,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance,
      };
      return {
        financeSpaceId: job.financeSpaceId,
        importJobId: job.id,
        recordType: l.kind === 'LINE' ? 'STATEMENT_LINE' : l.kind,
        rawData: l.raw as Prisma.InputJsonValue,
        normalizedData: data as unknown as Prisma.InputJsonValue,
        confidence: parsed.confidence,
        // Baris saldo awal/akhir hanya informasi, bukan transaksi
        reviewStatus: l.kind === 'LINE' ? 'PENDING' : 'IGNORED',
        createdBy: job.createdBy,
      };
    });
    if (!records.some((r) => r.recordType === 'STATEMENT_LINE')) {
      throw new Error('Tidak ada baris mutasi yang dapat dibaca dari dokumen ini.');
    }
    const lines = parsed.lines.filter((l) => l.kind === 'LINE');
    const totalDebit = lines.reduce((s, l) => s.plus(l.debit ?? 0), new Prisma.Decimal(0));
    const totalCredit = lines.reduce((s, l) => s.plus(l.credit ?? 0), new Prisma.Decimal(0));

    await this.prisma.$transaction(async (tx) => {
      await tx.extractedRecord.createMany({ data: records });
      await tx.importJob.update({
        where: { id: job.id },
        data: {
          periodStart: parsed.periodStart ? toDateOnly(parsed.periodStart) : null,
          periodEnd: parsed.periodEnd ? toDateOnly(parsed.periodEnd) : null,
        },
      });
      await tx.bankStatementBalance.updateMany({
        where: { importJobId: job.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (job.accountId) {
        await tx.bankStatementBalance.create({
          data: {
            financeSpaceId: job.financeSpaceId,
            importJobId: job.id,
            accountId: job.accountId,
            openingBalance: parsed.openingBalance,
            endingBalance: parsed.endingBalance,
            totalDebit,
            totalCredit,
            createdBy: job.createdBy,
          },
        });
      }
    });
  }

  private async saveReceipt(
    job: ImportJob,
    mimeType: string,
    buffer: Buffer,
    categories: { id: string; name: string; type: string }[],
  ): Promise<string | null> {
    const base: NormalizedRecord = {
      date: null,
      description: '',
      type: 'EXPENSE',
      amount: null,
      accountId: null,
      categoryId: null,
      counterpartAccountId: null,
      merchant: null,
      receiptNumber: null,
      paymentMethod: null,
      subtotal: null,
      discount: null,
      tax: null,
      otherFees: null,
      lowConfidenceFields: ['merchant', 'date', 'amount'],
    };

    if (!this.extractor.enabled) {
      await this.prisma.extractedRecord.create({
        data: {
          financeSpaceId: job.financeSpaceId,
          importJobId: job.id,
          recordType: 'RECEIPT',
          normalizedData: base as unknown as Prisma.InputJsonValue,
          confidence: 0,
          createdBy: job.createdBy,
        },
      });
      return 'Pembacaan otomatis tidak aktif. Silakan isi data struk secara manual sambil melihat pratinjau.';
    }

    const r = await this.extractor.extractReceipt({ mimeType, data: buffer });
    const money = (v: number | null) => (v === null || v === undefined ? null : Math.abs(v).toFixed(2));
    const items = r.items.filter((i) => i.name?.trim());
    const total = money(r.total) ?? (items.length ? items.reduce((s, i) => s + i.line_total, 0).toFixed(2) : null);
    const text = [r.merchant, ...items.map((i) => i.name)].filter(Boolean).join(' ');
    const lowConfidence = new Set(r.low_confidence_fields.map((f) => (f === 'total' ? 'amount' : f)));
    if (!r.date) lowConfidence.add('date');
    if (!total) lowConfidence.add('amount');
    const data: NormalizedRecord = {
      ...base,
      date: parseDate(r.date),
      description: r.merchant ? `Belanja di ${r.merchant}` : 'Belanja',
      amount: total,
      categoryId: this.suggestCategory(text, 'EXPENSE', categories),
      merchant: r.merchant,
      receiptNumber: r.receipt_number,
      paymentMethod: r.payment_method,
      subtotal: money(r.subtotal),
      discount: money(r.discount),
      tax: money(r.tax),
      otherFees: money(r.other_fees),
      lowConfidenceFields: [...lowConfidence],
    };
    await this.prisma.extractedRecord.create({
      data: {
        financeSpaceId: job.financeSpaceId,
        importJobId: job.id,
        recordType: 'RECEIPT',
        rawData: r as unknown as Prisma.InputJsonValue,
        normalizedData: data as unknown as Prisma.InputJsonValue,
        confidence: Math.max(0, Math.min(1, r.confidence)),
        createdBy: job.createdBy,
        items: {
          create: items.map((i) => ({
            itemName: i.name.slice(0, 255),
            quantity: i.quantity > 0 ? i.quantity : 1,
            unitPrice: Math.abs(i.unit_price),
            lineTotal: Math.abs(i.line_total),
            createdBy: job.createdBy,
          })),
        },
      },
    });
    return null;
  }

  // ---------------------------------------------------------------------------
  // Membaca & review
  // ---------------------------------------------------------------------------

  async list(spaceId: string, page: number, pageSize: number) {
    const where = { financeSpaceId: spaceId, deletedAt: null };
    const [jobs, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        include: {
          file: { select: { originalName: true, mimeType: true, sizeBytes: true } },
          _count: { select: { records: { where: { deletedAt: null, recordType: { in: ['STATEMENT_LINE', 'RECEIPT'] } } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.importJob.count({ where }),
    ]);
    return paginate(
      jobs.map(({ _count, ...j }) => ({ ...j, recordCount: _count.records })),
      total,
      page,
      pageSize,
    );
  }

  private async getJob(spaceId: string, id: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id, financeSpaceId: spaceId, deletedAt: null },
      include: { file: true },
    });
    if (!job) throw new NotFoundException('Data impor tidak ditemukan');
    return job;
  }

  async detail(spaceId: string, id: string) {
    const job = await this.getJob(spaceId, id);
    const records = await this.prisma.extractedRecord.findMany({
      where: { importJobId: id, deletedAt: null },
      include: {
        items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        links: { where: { deletedAt: null }, select: { transactionId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const duplicates = await this.findDuplicates(spaceId, job, records);
    const balance = await this.prisma.bankStatementBalance.findFirst({ where: { importJobId: id, deletedAt: null } });

    const lines = records.filter((r) => r.recordType === 'STATEMENT_LINE');
    const sum = (key: 'debit' | 'credit', onlyApproved = false) =>
      lines
        .filter((r) => !onlyApproved || r.reviewStatus === 'APPROVED')
        .reduce((s, r) => s.plus((r.normalizedData as any)?.[key] ?? 0), new Prisma.Decimal(0));

    let reconciliation: Record<string, string | boolean | null> | null = null;
    if (job.sourceType === 'E_STATEMENT') {
      const opening = records.find((r) => r.recordType === 'OPENING_BALANCE');
      const ending = records.find((r) => r.recordType === 'ENDING_BALANCE');
      const openingBalance = balance?.openingBalance?.toFixed(2) ?? (opening?.normalizedData as any)?.balance ?? null;
      const endingBalance = balance?.endingBalance?.toFixed(2) ?? (ending?.normalizedData as any)?.balance ?? null;
      const totalDebit = sum('debit');
      const totalCredit = sum('credit');
      const computed = openingBalance !== null ? new Prisma.Decimal(openingBalance).plus(totalCredit).minus(totalDebit) : null;
      // Sistem tidak mengubah angka secara diam-diam; selisih ditampilkan untuk diperiksa
      reconciliation = {
        openingBalance,
        endingBalance,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        computedEndingBalance: computed?.toFixed(2) ?? null,
        difference: computed && endingBalance !== null ? new Prisma.Decimal(endingBalance).minus(computed).toFixed(2) : null,
        balanced: computed && endingBalance !== null ? computed.eq(endingBalance) : null,
      };
    }

    const approved = records.filter((r) => r.reviewStatus === 'APPROVED' && ['STATEMENT_LINE', 'RECEIPT'].includes(r.recordType));
    const sumApproved = (type: string) =>
      approved
        .filter((r) => (r.normalizedData as any)?.type === type)
        .reduce((s, r) => s.plus((r.normalizedData as any)?.amount ?? 0), new Prisma.Decimal(0))
        .toFixed(2);

    const { file, ...rest } = job;
    return {
      ...rest,
      file: { id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, status: file.status },
      records: records.map(({ links, ...r }) => ({
        ...r,
        transactionId: links[0]?.transactionId ?? null,
        duplicates: duplicates.get(r.id) ?? [],
      })),
      reconciliation,
      summary: {
        total: records.filter((r) => ['STATEMENT_LINE', 'RECEIPT'].includes(r.recordType)).length,
        approved: approved.length,
        imported: records.filter((r) => r.links.length > 0).length,
        approvedIncome: sumApproved('INCOME'),
        approvedExpense: sumApproved('EXPENSE'),
        approvedTransfer: sumApproved('TRANSFER'),
        possibleDuplicates: [...duplicates.values()].filter((d) => d.length > 0).length,
      },
    };
  }

  /**
   * Deteksi kemungkinan duplikasi berdasarkan akun, tanggal (±2 hari), nominal,
   * dan kemiripan deskripsi. Keputusan akhir tetap di tangan pengguna.
   */
  private async findDuplicates(spaceId: string, job: ImportJob, records: (ExtractedRecord & { links: { transactionId: string }[] })[]) {
    const result = new Map<string, { id: string; date: string; amount: string; description: string | null; score: number; alreadyImported: boolean }[]>();
    const candidates = records.filter(
      (r) => ['STATEMENT_LINE', 'RECEIPT'].includes(r.recordType) && !r.links.length && (r.normalizedData as any)?.date && (r.normalizedData as any)?.amount,
    );
    if (!candidates.length) return result;
    const dates = candidates.map((r) => (r.normalizedData as any).date as string).sort();
    const amounts = [...new Set(candidates.map((r) => (r.normalizedData as any).amount as string))];
    const txs = await this.prisma.transaction.findMany({
      where: {
        financeSpaceId: spaceId,
        deletedAt: null,
        status: 'VALID',
        amount: { in: amounts.map((a) => new Prisma.Decimal(a)) },
        transactionDate: { gte: localStartOfDay(addPeriod(dates[0], 'DAILY', -2)), lt: localStartOfDay(addPeriod(dates[dates.length - 1], 'DAILY', 3)) },
      },
      select: { id: true, accountId: true, destinationAccountId: true, amount: true, transactionDate: true, description: true },
    });
    const links = await this.prisma.importedTransactionLink.findMany({
      where: { transactionId: { in: txs.map((t) => t.id) }, deletedAt: null },
      select: { transactionId: true },
    });
    const imported = new Set(links.map((l) => l.transactionId));

    for (const r of candidates) {
      const d = r.normalizedData as unknown as NormalizedRecord;
      const accountId = d.accountId ?? job.accountId;
      const words = new Set(normalizeDescription(d.description || d.merchant || '').split(' ').filter((w) => w.length > 2));
      const matches = txs
        .filter((t) => t.amount.eq(d.amount!))
        .filter((t) => !accountId || t.accountId === accountId || t.destinationAccountId === accountId)
        .map((t) => {
          const tDate = localDateString(t.transactionDate);
          const dayDiff = Math.abs(Date.parse(tDate) - Date.parse(d.date!)) / 86400000;
          if (dayDiff > 2) return null;
          const tWords = normalizeDescription(t.description ?? '').split(' ').filter((w) => w.length > 2);
          const overlap = words.size ? tWords.filter((w) => words.has(w)).length / words.size : 0;
          const score = Math.round((0.6 + (dayDiff === 0 ? 0.2 : 0.1) + Math.min(0.2, overlap * 0.2)) * 100) / 100;
          return { id: t.id, date: tDate, amount: t.amount.toFixed(2), description: t.description, score, alreadyImported: imported.has(t.id) };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      result.set(r.id, matches);
    }
    return result;
  }

  async updateJob(user: AuthUser, spaceId: string, id: string, accountId?: string) {
    const job = await this.getJob(spaceId, id);
    if (accountId) {
      const acc = await this.prisma.account.findFirst({ where: { id: accountId, financeSpaceId: spaceId, deletedAt: null } });
      if (!acc) throw new BadRequestException('Akun tidak ditemukan di ruang ini');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.importJob.update({ where: { id }, data: { accountId: accountId ?? null, updatedBy: user.id } });
      const bal = await tx.bankStatementBalance.findFirst({ where: { importJobId: id, deletedAt: null } });
      if (bal && accountId) {
        await tx.bankStatementBalance.update({ where: { id: bal.id }, data: { accountId, updatedBy: user.id } });
      } else if (!bal && accountId && job.sourceType === 'E_STATEMENT' && job.status !== 'FAILED') {
        const recs = await tx.extractedRecord.findMany({ where: { importJobId: id, deletedAt: null } });
        const get = (t: string) => (recs.find((r) => r.recordType === t)?.normalizedData as any)?.balance ?? null;
        const lines = recs.filter((r) => r.recordType === 'STATEMENT_LINE');
        const total = (k: string) => lines.reduce((s, r) => s.plus((r.normalizedData as any)?.[k] ?? 0), new Prisma.Decimal(0));
        await tx.bankStatementBalance.create({
          data: {
            financeSpaceId: spaceId,
            importJobId: id,
            accountId,
            openingBalance: get('OPENING_BALANCE'),
            endingBalance: get('ENDING_BALANCE'),
            totalDebit: total('debit'),
            totalCredit: total('credit'),
            createdBy: user.id,
          },
        });
      }
    });
    return this.detail(spaceId, id);
  }

  private async getRecord(spaceId: string, jobId: string, recordId: string) {
    const record = await this.prisma.extractedRecord.findFirst({
      where: { id: recordId, importJobId: jobId, financeSpaceId: spaceId, deletedAt: null },
      include: { links: { where: { deletedAt: null } } },
    });
    if (!record) throw new NotFoundException('Baris hasil ekstraksi tidak ditemukan');
    if (record.links.length) throw new BadRequestException('Baris ini sudah diimpor menjadi transaksi');
    return record;
  }

  async updateRecord(user: AuthUser, spaceId: string, jobId: string, recordId: string, dto: UpdateRecordDto) {
    await this.getJob(spaceId, jobId);
    const record = await this.getRecord(spaceId, jobId, recordId);
    const current = record.normalizedData as unknown as NormalizedRecord;
    // Hanya field yang benar-benar dikirim (instance DTO bisa memuat key bernilai undefined)
    const patch = Object.fromEntries(Object.entries(dto.data ?? {}).filter(([, v]) => v !== undefined));
    const next: NormalizedRecord = { ...current, ...patch } as NormalizedRecord;
    if (patch.type && patch.type !== current.type && !('categoryId' in patch)) next.categoryId = null;
    if (next.type === 'TRANSFER') next.categoryId = null;
    if (Object.keys(patch).length) {
      // Field yang sudah dikoreksi pengguna tidak lagi ditandai "keyakinan rendah"
      const touched = new Set(Object.keys(patch));
      next.lowConfidenceFields = (current.lowConfidenceFields ?? []).filter((f) => !touched.has(f));
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.extractedRecord.update({
        where: { id: recordId },
        data: {
          normalizedData: next as unknown as Prisma.InputJsonValue,
          ...(dto.reviewStatus
            ? { reviewStatus: dto.reviewStatus, reviewedAt: new Date(), reviewedBy: user.id }
            : {}),
          updatedBy: user.id,
        },
      });
      if (dto.items) {
        await tx.receiptItem.updateMany({
          where: { extractedRecordId: recordId, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: user.id },
        });
        if (dto.items.length) {
          await tx.receiptItem.createMany({
            data: dto.items.map((i) => ({
              extractedRecordId: recordId,
              itemName: i.itemName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              lineTotal: i.lineTotal,
              createdBy: user.id,
            })),
          });
        }
      }
    });
    return { ok: true };
  }

  async bulkUpdate(user: AuthUser, spaceId: string, jobId: string, dto: BulkUpdateRecordsDto) {
    await this.getJob(spaceId, jobId);
    const records = await this.prisma.extractedRecord.findMany({
      where: {
        id: { in: dto.recordIds },
        importJobId: jobId,
        deletedAt: null,
        recordType: { in: ['STATEMENT_LINE', 'RECEIPT'] },
        links: { none: { deletedAt: null } },
      },
    });
    let category: { id: string; type: string } | null = null;
    if (dto.categoryId) {
      category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, financeSpaceId: spaceId, deletedAt: null } });
      if (!category) throw new BadRequestException('Kategori tidak ditemukan');
    }
    await this.prisma.$transaction(
      records.map((r) => {
        const data = r.normalizedData as unknown as NormalizedRecord;
        const applyCategory = category && data.type === category.type;
        return this.prisma.extractedRecord.update({
          where: { id: r.id },
          data: {
            ...(applyCategory ? { normalizedData: { ...data, categoryId: category!.id } as unknown as Prisma.InputJsonValue } : {}),
            ...(dto.reviewStatus ? { reviewStatus: dto.reviewStatus, reviewedAt: new Date(), reviewedBy: user.id } : {}),
            updatedBy: user.id,
          },
        });
      }),
    );
    return { updated: records.length };
  }

  // ---------------------------------------------------------------------------
  // Impor final
  // ---------------------------------------------------------------------------

  /** Membuat transaksi final HANYA dari baris yang disetujui pengguna, secara atomik. */
  async commit(user: AuthUser, spaceId: string, jobId: string) {
    const job = await this.getJob(spaceId, jobId);
    if (!['NEEDS_REVIEW', 'APPROVED', 'IMPORTED'].includes(job.status)) {
      throw new BadRequestException('Dokumen belum siap diimpor');
    }
    const records = await this.prisma.extractedRecord.findMany({
      where: {
        importJobId: jobId,
        deletedAt: null,
        reviewStatus: 'APPROVED',
        recordType: { in: ['STATEMENT_LINE', 'RECEIPT'] },
        links: { none: { deletedAt: null } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!records.length) throw new BadRequestException('Belum ada baris yang disetujui untuk diimpor');

    const created = await this.prisma.$transaction(
      async (tx) => {
        await tx.importJob.update({ where: { id: jobId }, data: { status: 'APPROVED', updatedBy: user.id } });
        const ids: string[] = [];
        for (const [index, r] of records.entries()) {
          const d = r.normalizedData as unknown as NormalizedRecord;
          const label = r.recordType === 'RECEIPT' ? 'Struk' : `Baris ${index + 1} (${d.date ?? '-'} ${d.description?.slice(0, 40) ?? ''})`;
          const accountId = d.accountId ?? job.accountId;
          if (!accountId) throw new BadRequestException(`${label}: pilih akun terlebih dahulu`);
          if (!d.date) throw new BadRequestException(`${label}: tanggal belum diisi`);
          if (!d.amount || Number(d.amount) <= 0) throw new BadRequestException(`${label}: nominal belum valid`);

          let source = accountId;
          let destination: string | null = null;
          if (d.type === 'TRANSFER') {
            if (!d.counterpartAccountId) throw new BadRequestException(`${label}: pilih akun lawan untuk transfer`);
            // Baris kredit = uang masuk ke akun ini, berarti transfer DARI akun lawan
            const incoming = r.recordType === 'STATEMENT_LINE' && !!d.credit && !d.debit;
            source = incoming ? d.counterpartAccountId : accountId;
            destination = incoming ? accountId : d.counterpartAccountId;
          }
          const transactionDate = new Date(localStartOfDay(d.date).getTime() + 12 * 3600 * 1000);
          const input = {
            type: d.type,
            accountId: source,
            destinationAccountId: destination,
            categoryId: d.type === 'TRANSFER' ? null : d.categoryId,
            amount: d.amount,
            transactionDate,
          };
          try {
            await this.transactions.validate(spaceId, input, tx);
          } catch (e) {
            throw new BadRequestException(`${label}: ${e.message}`);
          }
          const description =
            (d.description?.trim() || (d.merchant ? `Belanja di ${d.merchant}` : 'Impor dokumen')) +
            (d.receiptNumber ? ` (No. ${d.receiptNumber})` : '');
          const t = await tx.transaction.create({
            data: {
              financeSpaceId: spaceId,
              type: input.type,
              accountId: input.accountId,
              destinationAccountId: input.destinationAccountId,
              categoryId: input.categoryId ?? null,
              amount: input.amount,
              transactionDate,
              description: description.slice(0, 1000),
              createdBy: user.id,
            },
          });
          await tx.importedTransactionLink.create({
            data: { financeSpaceId: spaceId, importJobId: jobId, extractedRecordId: r.id, transactionId: t.id, createdBy: user.id },
          });
          ids.push(t.id);
        }
        await tx.importJob.update({ where: { id: jobId }, data: { status: 'IMPORTED', updatedBy: user.id } });
        await this.audit.log(
          {
            spaceId,
            actorId: user.id,
            action: 'import.commit',
            entityType: 'import_job',
            entityId: jobId,
            metadata: { transactionIds: ids, count: ids.length },
          },
          tx,
        );
        return ids;
      },
      { timeout: 60_000 },
    );
    return { imported: created.length, transactionIds: created };
  }

  async reprocess(user: AuthUser, spaceId: string, id: string) {
    const job = await this.getJob(spaceId, id);
    if (job.status === 'PROCESSING') throw new BadRequestException('Dokumen sedang diproses');
    await this.audit.log({ spaceId, actorId: user.id, action: 'import.reprocess', entityType: 'import_job', entityId: id });
    setImmediate(() => void this.process(id));
    return { ok: true };
  }

  async file(spaceId: string, id: string) {
    const job = await this.getJob(spaceId, id);
    return { file: job.file, stream: this.storage.stream(job.file.storageKey) };
  }

  /** Hapus dokumen sumber (retensi). Transaksi yang sudah diimpor tetap tersimpan. */
  async remove(user: AuthUser, member: SpaceMember, spaceId: string, id: string) {
    const job = await this.getJob(spaceId, id);
    if (!hasRole(member.role, 'EDITOR') && job.createdBy !== user.id) {
      throw new ForbiddenException('Anda hanya dapat menghapus dokumen yang Anda unggah');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.importJob.update({ where: { id }, data: { deletedAt: now, deletedBy: user.id } });
      const otherJobs = await tx.importJob.count({ where: { fileId: job.fileId, deletedAt: null } });
      if (!otherJobs) await tx.importFile.update({ where: { id: job.fileId }, data: { deletedAt: now, deletedBy: user.id } });
      await this.audit.log(
        { spaceId, actorId: user.id, action: 'import.delete', entityType: 'import_job', entityId: id, metadata: { fileName: job.file.originalName } },
        tx,
      );
    });
    const stillUsed = await this.prisma.importJob.count({ where: { fileId: job.fileId, deletedAt: null } });
    if (!stillUsed) await this.storage.remove(job.file.storageKey);
    return { ok: true };
  }
}
