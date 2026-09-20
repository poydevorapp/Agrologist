import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';

try {
  const app = await NestFactory.createApplicationContext(AppModule, { abortOnError: false });
  await app.close();
} catch {
  console.error('Database check failed. Verify local configuration and PostgreSQL availability.');
  process.exitCode = 1;
}
