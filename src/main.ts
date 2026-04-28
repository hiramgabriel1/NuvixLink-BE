import 'dotenv/config';
import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorCode } from './common/errors';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { getCorsOrigins } from './cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          details: errors,
        }),
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nuvix Backend API')
    .setDescription('API docs for auth, users and posts')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 5001);
}

bootstrap();

