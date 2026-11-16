import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MIN_ROLE } from './decorators';
import { hasRole, type AppRequest } from './types';

/**
 * Memastikan pengguna adalah anggota AKTIF dari finance space pada parameter
 * `:spaceId`, lalu memeriksa role minimum (@MinRole). Default: VIEWER (baca saja).
 */
@Injectable()
export class SpaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const spaceId = String(req.params.spaceId ?? "");
    if (!req.user || !spaceId) throw new ForbiddenException();
    if (!/^[0-9a-f-]{36}$/i.test(spaceId)) throw new NotFoundException('Ruang keuangan tidak ditemukan');

    const membership = await this.prisma.spaceMember.findFirst({
      where: { financeSpaceId: spaceId, userId: req.user.id, status: 'ACTIVE', deletedAt: null },
      include: { financeSpace: true },
    });
    if (!membership || membership.financeSpace.deletedAt) {
      // Tidak membocorkan keberadaan ruang milik orang lain
      throw new NotFoundException('Ruang keuangan tidak ditemukan');
    }

    const min =
      this.reflector.getAllAndOverride<MemberRole>(MIN_ROLE, [ctx.getHandler(), ctx.getClass()]) ?? 'VIEWER';
    if (!hasRole(membership.role, min)) {
      throw new ForbiddenException('Role Anda tidak memiliki izin untuk aksi ini');
    }

    const { financeSpace, ...member } = membership;
    req.membership = member;
    req.space = financeSpace;
    return true;
  }
}
