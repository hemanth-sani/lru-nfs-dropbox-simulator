import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Enable CORS explicitly for your React dev server
  const corsOptions: CorsOptions = {
    origin: ['http://localhost:5173'], // React dev server
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-offset'],
    credentials: true,
  };
  app.enableCors(corsOptions);

  // ✅ Allow raw binary for PATCH uploads only
  app.use(
    '/api/files',
    express.raw({ type: 'application/octet-stream', limit: '20mb' }),
  );

  await app.listen(3000);
  console.log('🚀 Server running on http://localhost:3000');
}
bootstrap();
