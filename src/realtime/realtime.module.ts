import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { Classroom, ClassroomSchema } from '../classrooms/schemas/classroom.schema.js';
import { Participant, ParticipantSchema } from '../classrooms/schemas/participant.schema.js';
import { UsersModule } from '../users/users.module.js';
import { WhiteboardModule } from '../whiteboard/whiteboard.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { WebrtcModule } from '../webrtc/webrtc.module.js';
import { ClassroomGateway } from './classroom.gateway.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Participant.name, schema: ParticipantSchema },
    ]),
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
