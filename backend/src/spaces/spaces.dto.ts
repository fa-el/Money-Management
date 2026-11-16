import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { MemberRole, SpaceType } from '@prisma/client';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateSpaceDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsIn(Object.values(SpaceType))
  type: SpaceType;

  @IsOptional()
  @trim()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class UpdateSpaceDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class InviteMemberDto {
  @trim()
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @IsIn(['ADMIN', 'EDITOR', 'MEMBER', 'VIEWER'])
  role: MemberRole;
}

export class ChangeRoleDto {
  @IsIn(['ADMIN', 'EDITOR', 'MEMBER', 'VIEWER'])
  role: MemberRole;
}
