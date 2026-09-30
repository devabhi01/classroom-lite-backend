import { Module, forwardRef } from '@nestjs/common';
import { InstitutionsController } from './institutions.controller.js';
import { InstitutionsService } from './institutions.service.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

@Module({
  imports: [forwardRef(() => RealtimeModule)],
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
