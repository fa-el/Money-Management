import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  spaceId?: string | null;
  actorId?: string | null;
  action: string; // contoh: transaction.create, member.role_change
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mencatat aktivitas penting. Bisa dipanggil di dalam database transaction (param db). */
  async log(entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        financeSpaceId: entry.spaceId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: JSON.parse(JSON.stringify(entry.metadata ?? {})),
      },
    });
  }

  async list(spaceId: string, page: number, pageSize: number) {
    const where = { financeSpaceId: spaceId };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    return {
      data: rows.map((r) => ({ ...r, actorName: r.actorId ? names.get(r.actorId) ?? null : null })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
