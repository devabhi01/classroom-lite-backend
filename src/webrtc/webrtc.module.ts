import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Participant,
  ParticipantSchema,
} from '../classrooms/schemas/participant.schema.js';
import { WebrtcService } from './webrtc.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Participant.name, schema: ParticipantSchema },
    ]),
  ],
  providers: [WebrtcService],
  exports: [WebrtcService],
})
export class WebrtcModule {}
