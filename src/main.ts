import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

function validateCorsOrigin(origin: string): string {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`Origine CORS invalide : ${origin}`);
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    throw new Error(`Origine CORS invalide : ${origin}`);
  }

  if (
    parsedOrigin.pathname !== '/' ||
    parsedOrigin.search !== '' ||
    parsedOrigin.hash !== ''
  ) {
    throw new Error(`Origine CORS invalide : ${origin}`);
  }

  const loopbackHost = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(
    parsedOrigin.hostname,
  );

  if (process.env.NODE_ENV === 'production' && loopbackHost) {
    throw new Error(`Origine CORS locale interdite en production : ${origin}`);
  }

  return parsedOrigin.origin;
}

export function resolvePort(): number {
  const rawPort = process.env.PORT ?? '3003';

  if (rawPort.trim() === '') {
    throw new Error(`Variable PORT invalide : "${rawPort}"`);
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port)) {
    throw new Error(`Variable PORT invalide : "${rawPort}"`);
  }

  if (port < 1 || port > 65535) {
    throw new Error(`Variable PORT hors plage : "${rawPort}"`);
  }

  return port;
}

export function resolveCorsOrigins(): string[] {
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return configuredOrigins.map(validateCorsOrigin);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS doit être défini en production');
  }

  return ['http://localhost:5173'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  const origins = resolveCorsOrigins();
  app.enableCors({ origin: origins, credentials: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chatvardage Rooms Service')
    .setDescription('API de gestion des salons de Chatvardage')
    .setVersion('2.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = resolvePort();
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
