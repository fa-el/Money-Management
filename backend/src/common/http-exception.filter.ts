import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Format error API yang konsisten:
 * { statusCode, error, message, details? }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Terjadi kesalahan pada server';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (typeof body === 'string') message = body;
      else if (Array.isArray(body?.message)) {
        message = body.message[0];
        details = body.message;
      } else message = body?.message ?? exception.message;
      if (status === 413) message = 'Ukuran file melebihi batas yang diizinkan';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Data yang sama sudah ada';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Data tidak ditemukan';
      } else if (exception.code === 'P2003' || exception.code === 'P2004') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Relasi data tidak valid (data harus berada di ruang keuangan yang sama)';
      }
    }
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));

    res.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      ...(details ? { details } : {}),
    });
  }
}
