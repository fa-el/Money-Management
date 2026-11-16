import { BadRequestException, Injectable } from '@nestjs/common';
import type { FinanceSpace, SpaceMember } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CATEGORIES } from './default-categories';
import { CreateSpaceDto, UpdateSpaceDto } from './spaces.dto';

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listMine(userId: string) {
    const memberships = await this.prisma.spaceMember.findMany({
      where: { userId, status: 'ACTIVE', deletedAt: null, financeSpace: { deletedAt: null } },
      include: { financeSpace: true },
      orderBy: { createdAt: 'asc' },
    });
    const counts = await this.prisma.spaceMember.groupBy({
      by: ['financeSpaceId'],
      where: { financeSpaceId: { in: memberships.map((m) => m.financeSpaceId) }, status: 'ACTIVE', deletedAt: null },
      _count: true,
    });
    const countMap = new Map(counts.map((c) => [c.financeSpaceId, c._count]));
    return memberships.map((m) => ({
      ...m.financeSpace,
      role: m.role,
      memberCount: countMap.get(m.financeSpaceId) ?? 1,
    }));
  }

  async create(user: AuthUser, dto: CreateSpaceDto) {
    const space = await this.prisma.$transaction(async (tx) => {
      const space = await tx.financeSpace.create({
        data: { name: dto.name, type: dto.type, currency: (dto.currency ?? 'IDR').toUpperCase(), createdBy: user.id },
      });
      await tx.spaceMember.create({
        data: {
          financeSpaceId: space.id,
          userId: user.id,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
          createdBy: user.id,
        },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES[dto.type].map((c) => ({ ...c, financeSpaceId: space.id, createdBy: user.id })),
      });
      await this.audit.log(
        { spaceId: space.id, actorId: user.id, action: 'space.create', entityType: 'finance_space', entityId: space.id },
        tx,
      );
      return space;
    });
    return { ...space, role: 'OWNER', memberCount: 1 };
  }

  detail(space: FinanceSpace, membership: SpaceMember) {
    return { ...space, role: membership.role, membershipId: membership.id };
  }

  async update(user: AuthUser, space: FinanceSpace, dto: UpdateSpaceDto) {
    const updated = await this.prisma.financeSpace.update({
      where: { id: space.id },
      data: { name: dto.name, currency: dto.currency?.toUpperCase(), updatedBy: user.id },
    });
    await this.audit.log({
      spaceId: space.id,
      actorId: user.id,
      action: 'space.update',
      entityType: 'finance_space',
      entityId: space.id,
      metadata: { before: { name: space.name, currency: space.currency }, after: dto },
    });
    return updated;
  }

  async remove(user: AuthUser, space: FinanceSpace, confirmName?: string) {
    if (confirmName !== space.name) {
      throw new BadRequestException('Ketik nama ruang dengan tepat untuk konfirmasi penghapusan');
    }
    await this.prisma.financeSpace.update({
      where: { id: space.id },
      data: { deletedAt: new Date(), deletedBy: user.id },
    });
    await this.audit.log({
      spaceId: space.id,
      actorId: user.id,
      action: 'space.delete',
      entityType: 'finance_space',
      entityId: space.id,
    });
    return { ok: true };
  }
}
