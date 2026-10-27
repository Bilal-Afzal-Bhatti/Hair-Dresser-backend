import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation/validation.factory';
import { I18nService } from './i18n/i18n.service';
import { UPLOADS_DIR } from './users/avatar.storage';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Profile photos: http://<server>:3000/uploads/avatars/<random>.jpg
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
  // 0.0.0.0 so a phone/emulator on the same network can reach it
  await app.listen(port, '0.0.0.0');
  Logger.log(`API on http://192.168.18.40:${port}/api/v1  ·  docs on http://192.168.18.40:${port}/docs`, 'Bootstrap');
}
bootstrap();
