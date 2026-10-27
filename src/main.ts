import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation/validation.factory';
import { I18nService } from './i18n/i18n.service';
import { UPLOADS_DIR } from './users/avatar.storage';
import type { Request, Response } from 'express';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

    // The main address ("/") says the API is running instead of "Cannot GET /"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.getHttpAdapter().get('/', (_req: unknown, res: any) => {
    res.json({ name: 'MT API', status: 'ok', api: '/api/v1', health: '/api/v1/health', docs: '/docs' });
  });

  // Profile photos: http://<server>/uploads/avatars/<random>.jpg
  // Images only (checked on upload), never a folder listing, never hidden files.
  app.useStaticAssets(UPLOADS_DIR, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });

  // Resolve the request language once (Accept-Language header -> en | fr | de ...), read via @Lang()
  const i18n = app.get(I18nService);
  app.use((req: any, _res: unknown, next: () => void) => {
    req.lang = i18n.resolve(req.headers['accept-language']);
    next();
  });

  const swagger = new DocumentBuilder()
    .setTitle('MT API')
    .setDescription('Hairdresser booking API. Send Accept-Language: en | fr | de on every request.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 so a phone/emulator on the same network can reach it (locally); Vercel sets PORT itself
  await app.listen(port, '0.0.0.0');
  Logger.log(`API running on port ${port}  ·  routes under /api/v1  ·  docs at /docs`, 'Bootstrap');
}
bootstrap();