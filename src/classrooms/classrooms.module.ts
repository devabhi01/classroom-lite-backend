import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Classroom, ClassroomSchema } from './schemas/classroom.schema.js';
import { Participant, ParticipantSchema } from './schemas/participant.schema.js';
import { ClassroomsService } from './classrooms.service.js';
import { ClassroomsController } from './classrooms.controller.js';
import { ClassroomCodeGenerator } from './utils/classroom-code.generator.js';
import { UsersModule } from '../users/users.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Participant.name, schema: ParticipantSchema },
    ]),
    UsersModule,
    RealtimeModule,
  ],
  controllers: [ClassroomsController],
  providers: [ClassroomsService, ClassroomCodeGenerator],
  exports: [ClassroomsService, ClassroomCodeGenerator, MongooseModule],
})
export class ClassroomsModule {}
