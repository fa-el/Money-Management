import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class RegisterDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @trim()
  @IsEmail({}, { message: 'Format email tidak valid' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @trim()
  @IsEmail({}, { message: 'Format email tidak valid' })
  email: string;

  @IsString()
  password: string;
}

export class UpdateProfileDto {
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @MaxLength(128)
  newPassword: string;
}
