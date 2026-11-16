import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import type { AppRequest } from './types';

export const IS_PUBLIC = 'isPublic';
/** Endpoint dapat diakses tanpa login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const MIN_ROLE = 'minRole';
/** Role minimum di finance space aktif untuk mengakses endpoint. */
export const MinRole = (role: MemberRole) => SetMetadata(MIN_ROLE, role);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().user!,
);

export const CurrentMember = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().membership!,
);

export const CurrentSpace = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>().space!,
);
