import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { createValidationPipe } from './common/validation.js';
import { startupErrorMessage } from './config/startup-error.js';

let startupHost = '127.0.0.1';
let startupPort = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableShutdownHooks();
  app.useGlobalPipes(createValidationPipe());
  const config = app.get(ConfigService);
  app.enableCors({
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  startupPort = config.getOrThrow<number>('PORT');
  startupHost = config.getOrThrow<string>('HOST');
  await app.listen(startupPort, startupHost);
}

bootstrap().catch((error: unknown) => {
  console.error(startupErrorMessage(error, startupHost, startupPort));
  process.exit(1);
});
