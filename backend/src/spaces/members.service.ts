import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { FinanceSpace, MemberRole, SpaceMember, SpaceType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ROLE_LEVEL, type AuthUser } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Role yang dapat diberikan per tipe ruang (bagian 3 dokumen perencanaan). */
const ALLOWED_ROLES: Record<SpaceType, MemberRole[]> = {
  PERSONAL: [],
  FAMILY: ['ADMIN', 'MEMBER', 'VIEWER'],
  BUSINESS: ['ADMIN', 'EDITOR', 'VIEWER'],
};

const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: 'Pemilik',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  MEMBER: 'Anggota',
  VIEWER: 'Pengamat',
};

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  allowedRoles(space: FinanceSpace) {
    return ALLOWED_ROLES[space.type];
  }

  async list(spaceId: string) {
    const members = await this.prisma.spaceMember.findMany({
      where: { financeSpaceId: spaceId, deletedAt: null },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return members;
  }

  /** Aktor hanya dapat mengelola anggota & memberi role yang levelnya di bawah dirinya. */
  private assertCanManage(actor: SpaceMember, targetRole: MemberRole, newRole?: MemberRole) {
    if (ROLE_LEVEL[targetRole] >= ROLE_LEVEL[actor.role]) {
      throw new ForbiddenException('Anda tidak dapat mengelola anggota dengan role setara atau lebih tinggi');
    }
    if (newRole && ROLE_LEVEL[newRole] >= ROLE_LEVEL[actor.role]) {
      throw new ForbiddenException('Anda tidak dapat memberikan role setara atau lebih tinggi dari role Anda');
    }
  }

  private assertRoleAllowed(space: FinanceSpace, role: MemberRole) {
    const allowed = ALLOWED_ROLES[space.type];
    if (!allowed.length) throw new BadRequestException('Ruang Personal tidak mendukung anggota tambahan');
    if (!allowed.includes(role)) {
      throw new BadRequestException(`Role ${role} tidak tersedia untuk ruang ${space.type}. Pilihan: ${allowed.join(', ')}`);
    }
  }

  async invite(user: AuthUser, actor: SpaceMember, space: FinanceSpace, email: string, role: MemberRole) {
    this.assertRoleAllowed(space, role);
    this.assertCanManage(actor, 'VIEWER', role);

    const invitee = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
    if (!invitee) {
      throw new NotFoundException('Pengguna dengan email tersebut belum terdaftar. Minta mereka mendaftar terlebih dahulu.');
    }
    const existing = await this.prisma.spaceMember.findFirst({
      where: { financeSpaceId: space.id, userId: invitee.id, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        existing.status === 'INVITED' ? 'Pengguna sudah diundang dan belum merespons' : 'Pengguna sudah menjadi anggota',
      );
    }

    const member = await this.prisma.$transaction(async (tx) => {
      const member = await tx.spaceMember.create({
        data: { financeSpaceId: space.id, userId: invitee.id, role, status: 'INVITED', createdBy: user.id },
      });
      await this.notifications.notify(
        [invitee.id],
        {
          spaceId: space.id,
          title: 'Undangan ruang keuangan',
          message: `${user.name} mengundang Anda ke "${space.name}" sebagai ${ROLE_LABEL[role]}.`,
          createdBy: user.id,
        },
        tx,
      );
      await this.audit.log(
        {
          spaceId: space.id,
          actorId: user.id,
          action: 'member.invite',
          entityType: 'space_member',
          entityId: member.id,
          metadata: { email: invitee.email, role },
        },
        tx,
      );
      return member;
    });
    return member;
  }

  private async findMember(spaceId: string, memberId: string) {
    const member = await this.prisma.spaceMember.findFirst({
      where: { id: memberId, financeSpaceId: spaceId, deletedAt: null },
    });
    if (!member) throw new NotFoundException('Anggota tidak ditemukan');
    return member;
  }

  async changeRole(user: AuthUser, actor: SpaceMember, space: FinanceSpace, memberId: string, role: MemberRole) {
    const target = await this.findMember(space.id, memberId);
    if (target.id === actor.id) throw new BadRequestException('Tidak dapat mengubah role sendiri');
    this.assertRoleAllowed(space, role);
    this.assertCanManage(actor, target.role, role);
    const updated = await this.prisma.spaceMember.update({ where: { id: target.id }, data: { role, updatedBy: user.id } });
    await this.audit.log({
      spaceId: space.id,
      actorId: user.id,
      action: 'member.role_change',
      entityType: 'space_member',
      entityId: target.id,
      metadata: { from: target.role, to: role },
    });
    await this.notifications.notify([target.userId], {
      spaceId: space.id,
      title: 'Role diperbarui',
      message: `Role Anda di "${space.name}" sekarang ${ROLE_LABEL[role]}.`,
      createdBy: user.id,
    });
    return updated;
  }

  async remove(user: AuthUser, actor: SpaceMember, space: FinanceSpace, memberId: string) {
    const target = await this.findMember(space.id, memberId);
    if (target.id === actor.id) throw new BadRequestException('Gunakan fitur "Keluar dari ruang" untuk diri sendiri');
    this.assertCanManage(actor, target.role);
    await this.prisma.spaceMember.update({
      where: { id: target.id },
      data: { status: 'INACTIVE', deletedAt: new Date(), deletedBy: user.id },
    });
    await this.audit.log({
      spaceId: space.id,
      actorId: user.id,
      action: target.status === 'INVITED' ? 'member.invite_cancel' : 'member.remove',
      entityType: 'space_member',
      entityId: target.id,
    });
    return { ok: true };
  }

  async leave(user: AuthUser, actor: SpaceMember, space: FinanceSpace) {
    if (actor.role === 'OWNER') {
      throw new BadRequestException('Pemilik tidak dapat keluar. Alihkan kepemilikan terlebih dahulu.');
    }
    await this.prisma.spaceMember.update({
      where: { id: actor.id },
      data: { status: 'INACTIVE', deletedAt: new Date(), deletedBy: user.id },
    });
    await this.audit.log({ spaceId: space.id, actorId: user.id, action: 'member.leave', entityType: 'space_member', entityId: actor.id });
    return { ok: true };
  }

  async transferOwnership(user: AuthUser, actor: SpaceMember, space: FinanceSpace, memberId: string) {
    const target = await this.findMember(space.id, memberId);
    if (target.status !== 'ACTIVE') throw new BadRequestException('Kepemilikan hanya dapat dialihkan ke anggota aktif');
    if (target.id === actor.id) throw new BadRequestException('Anda sudah menjadi pemilik');
    await this.prisma.$transaction([
      this.prisma.spaceMember.update({ where: { id: target.id }, data: { role: 'OWNER', updatedBy: user.id } }),
      this.prisma.spaceMember.update({ where: { id: actor.id }, data: { role: 'ADMIN', updatedBy: user.id } }),
    ]);
    await this.audit.log({
      spaceId: space.id,
      actorId: user.id,
      action: 'space.ownership_transfer',
      entityType: 'space_member',
      entityId: target.id,
    });
    await this.notifications.notify([target.userId], {
      spaceId: space.id,
      title: 'Anda menjadi pemilik',
      message: `${user.name} mengalihkan kepemilikan "${space.name}" kepada Anda.`,
      createdBy: user.id,
    });
    return { ok: true };
  }

  // ---- Undangan dari sisi penerima ----

  myInvitations(userId: string) {
    return this.prisma.spaceMember.findMany({
      where: { userId, status: 'INVITED', deletedAt: null, financeSpace: { deletedAt: null } },
      include: { financeSpace: { select: { id: true, name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respond(user: AuthUser, invitationId: string, accept: boolean) {
    const inv = await this.prisma.spaceMember.findFirst({
      where: { id: invitationId, userId: user.id, status: 'INVITED', deletedAt: null },
      include: { financeSpace: true },
    });
    if (!inv) throw new NotFoundException('Undangan tidak ditemukan');
    const updated = await this.prisma.spaceMember.update({
      where: { id: inv.id },
      data: accept
        ? { status: 'ACTIVE', joinedAt: new Date(), updatedBy: user.id }
        : { status: 'INACTIVE', deletedAt: new Date(), deletedBy: user.id },
    });
    await this.audit.log({
      spaceId: inv.financeSpaceId,
      actorId: user.id,
      action: accept ? 'member.join' : 'member.decline',
      entityType: 'space_member',
      entityId: inv.id,
    });
    if (accept) {
      const admins = await this.prisma.spaceMember.findMany({
        where: { financeSpaceId: inv.financeSpaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE', deletedAt: null },
      });
      await this.notifications.notify(
        admins.map((a) => a.userId),
        {
          spaceId: inv.financeSpaceId,
          title: 'Anggota baru bergabung',
          message: `${user.name} bergabung ke "${inv.financeSpace.name}".`,
          createdBy: user.id,
        },
      );
    }
    return updated;
  }
}
