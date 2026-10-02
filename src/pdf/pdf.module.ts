import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service.js';
import { PdfController } from './pdf.controller.js';

@Module({
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
