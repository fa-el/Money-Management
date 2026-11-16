import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC } from './decorators';
import type { AppRequest } from './types';

export const SESSION_COOKIE = 'mm_session';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Guard global: memvalidasi token sesi dari cookie httpOnly atau header Bearer. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token: string | undefined =
      req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new UnauthorizedException('Silakan login terlebih dahulu');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || session.user.deletedAt) {
      throw new UnauthorizedException('Sesi tidak valid atau sudah kedaluwarsa');
    }
    req.user = { id: session.user.id, name: session.user.name, email: session.user.email, sessionId: session.id };
    return true;
  }
}
