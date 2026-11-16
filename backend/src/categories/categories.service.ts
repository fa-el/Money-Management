import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(spaceId: string, type?: CategoryType) {
    return this.prisma.category.findMany({
      where: { financeSpaceId: spaceId, deletedAt: null, ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(spaceId: string, id: string) {
    const c = await this.prisma.category.findFirst({ where: { id, financeSpaceId: spaceId, deletedAt: null } });
    if (!c) throw new NotFoundException('Kategori tidak ditemukan');
    return c;
  }

  private handleUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Nama kategori sudah dipakai untuk tipe yang sama');
    }
    throw e;
  }

  async create(user: AuthUser, spaceId: string, dto: CreateCategoryDto) {
    const category = await this.prisma.category
      .create({ data: { ...dto, financeSpaceId: spaceId, createdBy: user.id } })
      .catch((e) => this.handleUnique(e));
    await this.audit.log({ spaceId, actorId: user.id, action: 'category.create', entityType: 'category', entityId: category.id, metadata: { name: dto.name } });
    return category;
  }

  async update(user: AuthUser, spaceId: string, id: string, dto: UpdateCategoryDto) {
    await this.get(spaceId, id);
    const category = await this.prisma.category
      .update({ where: { id }, data: { ...dto, updatedBy: user.id } })
      .catch((e) => this.handleUnique(e));
    await this.audit.log({ spaceId, actorId: user.id, action: 'category.update', entityType: 'category', entityId: id, metadata: { changes: dto } });
    return category;
  }

  async remove(user: AuthUser, spaceId: string, id: string) {
    await this.get(spaceId, id);
    const [tx, budgets, recurring] = await Promise.all([
      this.prisma.transaction.count({ where: { categoryId: id, deletedAt: null } }),
      this.prisma.budget.count({ where: { categoryId: id, deletedAt: null } }),
      this.prisma.recurringTransaction.count({ where: { categoryId: id, deletedAt: null } }),
    ]);
    if (tx + budgets + recurring > 0) {
      throw new BadRequestException(
        'Kategori sudah dipakai transaksi/anggaran/transaksi berulang. Nonaktifkan kategori sebagai gantinya.',
      );
    }
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: user.id } });
    await this.audit.log({ spaceId, actorId: user.id, action: 'category.delete', entityType: 'category', entityId: id });
    return { ok: true };
  }
}
