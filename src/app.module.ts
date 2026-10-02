import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { configuration } from './config/configuration.js';
import { AppController } from './app.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { InstitutionsModule } from './institutions/institutions.module.js';
import { ClassroomsModule } from './classrooms/classrooms.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { WhiteboardModule } from './whiteboard/whiteboard.module.js';
import { PdfModule } from './pdf/pdf.module.js';
import { WebrtcModule } from './webrtc/webrtc.module.js';
import { EmailModule } from './email/email.module.js';

@Module({
  imports: [
    // Global Configuration Module
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Global Rate Limiting Throttler
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),

    // Global Prisma Database Module (PostgreSQL / Neon)
    PrismaModule,

    // Global Email Module
    EmailModule,

    // Feature Modules
    HealthModule,
    UsersModule,
    AuthModule,
    InstitutionsModule,
    ClassroomsModule,
    RealtimeModule,
    WhiteboardModule,
    PdfModule,
    WebrtcModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
