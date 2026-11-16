import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { hashToken } from '../common/auth.guard';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';

const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private findByEmail(email: string) {
    // Email unik case-insensitive (index lower(email) di database)
    return this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } });
  }

  async register(dto: RegisterDto) {
    if (await this.findByEmail(dto.email)) throw new ConflictException('Email sudah terdaftar');
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email.toLowerCase(), passwordHash: await hashPassword(dto.password) },
    });
    await this.audit.log({ actorId: user.id, action: 'user.register', entityType: 'user', entityId: user.id });
    return this.createSession(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.findByEmail(dto.email);
    // Pesan generik agar tidak membocorkan email mana yang terdaftar
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email atau password salah');
    }
    await this.audit.log({ actorId: user.id, action: 'user.login', entityType: 'user', entityId: user.id });
    return this.createSession(user.id);
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000);
    await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    // Bersihkan sesi kedaluwarsa milik user ini
    await this.prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    return { token, expiresAt };
  }

  async logout(user: AuthUser) {
    await this.prisma.session.deleteMany({ where: { id: user.sessionId } });
  }

  me(user: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  async updateProfile(user: AuthUser, name: string) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: { name, updatedBy: user.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(dto.currentPassword, record.passwordHash))) {
      throw new BadRequestException('Password lama salah');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(dto.newPassword), updatedBy: user.id },
      }),
      // Logout dari semua perangkat lain
      this.prisma.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'user.password_change', entityType: 'user', entityId: user.id });
    return { ok: true };
  }
}
