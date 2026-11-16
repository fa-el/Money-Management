import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    userIds: string[],
    data: { spaceId?: string | null; title: string; message: string; createdBy?: string },
    db: Db = this.prisma,
  ) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        financeSpaceId: data.spaceId ?? null,
        title: data.title,
        message: data.message,
        createdBy: data.createdBy ?? null,
      })),
    });
  }

  async list(userId: string, unreadOnly: boolean) {
    const where = { userId, deletedAt: null, ...(unreadOnly ? { isRead: false } : {}) };
    const [data, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId, deletedAt: null, isRead: false } }),
    ]);
    return { data, unread };
  }

  async markRead(userId: string, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId, deletedAt: null },
      data: { isRead: true, updatedBy: userId },
    });
    if (!res.count) throw new NotFoundException('Notifikasi tidak ditemukan');
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false, deletedAt: null },
      data: { isRead: true, updatedBy: userId },
    });
    return { ok: true };
  }
}
