import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CategoryType } from '@prisma/client';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateCategoryDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsIn(Object.values(CategoryType))
  type: CategoryType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
