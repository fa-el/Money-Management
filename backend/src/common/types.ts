import type { MemberRole, SpaceMember, FinanceSpace } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  sessionId: string;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  membership?: SpaceMember;
  space?: FinanceSpace;
}

/** Urutan hak akses: makin besar makin luas (least privilege). */
export const ROLE_LEVEL: Record<MemberRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  EDITOR: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function hasRole(role: MemberRole, min: MemberRole): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}
