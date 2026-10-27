import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.listen(3000, '127.0.0.1');
  // eslint-disable-next-line no-console
  console.log('Minime-Hackathon Phase 0 listening on http://127.0.0.1:3000');
}
bootstrap();
