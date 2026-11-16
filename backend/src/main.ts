import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

// BigInt (mis. size_bytes) tidak bisa di-JSON-kan secara default
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Aplikasi Pencatatan Keuangan API')
    .setDescription('REST API untuk Personal, Family, dan Business Finance (NestJS + Prisma + PostgreSQL)')
    .setVersion('1.1')
    .addBearerAuth()
    .addCookieAuth('mm_session')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  Logger.log(`API berjalan di http://localhost:${port}/api — dokumentasi: http://localhost:${port}/api/docs`, 'Bootstrap');
}
bootstrap();
