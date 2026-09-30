import { Module, Global } from '@nestjs/common';
import { SmsService } from './sms.service.js';

@Global()
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
