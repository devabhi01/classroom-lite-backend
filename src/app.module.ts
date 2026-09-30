import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Connection } from 'mongoose';

import { configuration } from './config/configuration.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClassroomsModule } from './classrooms/classrooms.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { WhiteboardModule } from './whiteboard/whiteboard.module.js';
import { PdfModule } from './pdf/pdf.module.js';
import { WebrtcModule } from './webrtc/webrtc.module.js';
import { MailModule } from './mail/mail.module.js';
import { SmsModule } from './sms/sms.module.js';

const mongooseLogger = new Logger('MongoDBAtlas');

@Module({
  imports: [
    // Global Configuration Module
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Global Rate Limiting Throttler (permissive for multi-client access)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),

    // Asynchronous Mongoose Module with MongoDB Atlas connection handling
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri =
          configService.get<string>('mongodbUri') ||
          configService.get<string>('MONGODB_URI');

        return {
          uri,
          dbName: 'classroom-lite',
          connectionFactory: (connection: Connection) => {
            connection.on('connected', () => {
              mongooseLogger.log(`MongoDB Atlas connected (database: ${connection.name})`);
            });

            connection.on('error', (error: any) => {
              mongooseLogger.error(
                `MongoDB Atlas connection error: ${error?.message || error}`,
              );
            });

            connection.on('disconnected', () => {
              mongooseLogger.warn('MongoDB Atlas disconnected');
            });

            return connection;
          },
        };
      },
    }),

    // Feature Modules
    HealthModule,
    UsersModule,
    AuthModule,
    ClassroomsModule,
    RealtimeModule,
    WhiteboardModule,
    PdfModule,
    WebrtcModule,
    MailModule,
    SmsModule,
  ],
})
export class AppModule {}
