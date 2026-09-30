import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { WhiteboardModule } from '../whiteboard/whiteboard.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { WebrtcModule } from '../webrtc/webrtc.module.js';
import { ClassroomGateway } from './classroom.gateway.js';

@Module({
  imports: [
    UsersModule,
    WhiteboardModule,
    PdfModule,
    WebrtcModule,
    JwtModule,
  ],
  providers: [ClassroomGateway],
  exports: [ClassroomGateway],
})
export class RealtimeModule {}
