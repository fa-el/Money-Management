import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE } from '../common/auth.guard';
import { CurrentUser, Public } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { AuthService } from './auth.service';

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    expires,
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Mendaftar akun baru dan langsung login (cookie sesi httpOnly). */
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.register(dto);
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    return { token, expiresAt };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.login(dto);
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    return { token, expiresAt };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user, dto.name);
  }

  @Patch('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }
}
