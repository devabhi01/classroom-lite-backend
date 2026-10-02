import { Module, forwardRef } from '@nestjs/common';
import { ClassroomsService } from './classrooms.service.js';
import { ClassroomsController } from './classrooms.controller.js';
import { ClassroomCodeGenerator } from './utils/classroom-code.generator.js';
import { UsersModule } from '../users/users.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => RealtimeModule),
  ],
  controllers: [ClassroomsController],
  providers: [ClassroomsService, ClassroomCodeGenerator],
  exports: [ClassroomsService, ClassroomCodeGenerator],
})
export class ClassroomsModule {}
