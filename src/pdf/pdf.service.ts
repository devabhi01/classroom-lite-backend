import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SharePdfDto } from './dto/share-pdf.dto.js';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sharePdf(classroomId: string, dto: SharePdfDto) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const activePdf = {
      fileName: dto.fileName,
      fileUrl: dto.fileUrl || '',
      totalPages: dto.totalPages,
      currentPage: 1,
    };

    await this.prisma.classroom.update({
      where: { id: classroomId },
      data: {
        activePdfFileName: activePdf.fileName,
        activePdfFileUrl: activePdf.fileUrl,
        activePdfTotalPages: activePdf.totalPages,
        activePdfCurrentPage: activePdf.currentPage,
      },
    });

    this.logger.log(`PDF shared in classroom ${classroomId}: ${dto.fileName}`);
    return activePdf;
  }

  async changePage(classroomId: string, page: number) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    if (!classroom.activePdfFileName) {
      throw new BadRequestException('No active PDF is currently being shared');
    }

    const totalPages = classroom.activePdfTotalPages || 1;
    if (page < 1 || page > totalPages) {
      throw new BadRequestException(
        `Invalid page number ${page}. Page must be between 1 and ${totalPages}`,
      );
    }

    await this.prisma.classroom.update({
      where: { id: classroomId },
      data: {
        activePdfCurrentPage: page,
      },
    });

    this.logger.log(`PDF page changed in classroom ${classroomId} to page: ${page}`);
    return {
      fileName: classroom.activePdfFileName,
      fileUrl: classroom.activePdfFileUrl || '',
      totalPages,
      currentPage: page,
    };
  }

  async closePdf(classroomId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    await this.prisma.classroom.update({
      where: { id: classroomId },
      data: {
        activePdfFileName: null,
        activePdfFileUrl: null,
        activePdfTotalPages: null,
        activePdfCurrentPage: null,
      },
    });

    this.logger.log(`PDF closed in classroom ${classroomId}`);
    return true;
  }
}
