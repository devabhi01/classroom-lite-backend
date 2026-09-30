import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import express from 'express';
import path from 'path';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { parseAllowedOrigins, isOriginAllowed } from './common/utils/cors.util.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;
  const frontendUrl =
    configService.get<string>('frontendUrl') || 'http://localhost:5173';
  const allowedOrigins = parseAllowedOrigins(frontendUrl);

  // Security: Helmet middleware (configured to allow hosted frontend embeds and resources)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
    }),
  );

  // Security: CORS (Restricted to configured hosted frontend origin(s))
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
      } else {
        logger.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
        callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'Range',
    ],
    exposedHeaders: ['Authorization', 'Content-Range', 'X-Total-Count'],
    maxAge: 86400,
  });

  // Serve static uploads (for shared PDF files, restricted to allowed origins)
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use(
    '/uploads',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const origin = req.headers.origin;
      if (origin && isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
      }
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    },
    express.static(uploadsDir),
  );

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Logging Interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger Documentation Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TDP Classroom Lite API')
    .setDescription(
      'Complete backend MVP API documentation for TDP Classroom Lite — a lightweight online classroom platform supporting real-time whiteboard, PDF sharing, participant management, and WebRTC screen sharing signaling.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT accessToken (without "Bearer " prefix)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Health', 'Health check and database status')
    .addTag('Auth', 'User registration and authentication')
    .addTag('Users', 'User profile management')
    .addTag('Classrooms', 'Classroom management and participation')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`=================================================`);
  logger.log(`TDP Classroom Lite Backend is running!`);
  logger.log(`Local Access:     http://localhost:${port}`);
  logger.log(`Network Access:   http://0.0.0.0:${port} (Accessible from any network/IP)`);
  logger.log(`Swagger Docs:     http://localhost:${port}/api/docs`);
  logger.log(`Socket.IO URL:    http://localhost:${port}/classroom`);
  logger.log(`Allowed CORS:     ${allowedOrigins.join(', ')}`);
  logger.log(`=================================================`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error(`Application failed to start: ${err.message}`, err.stack);
  process.exit(1);
});
