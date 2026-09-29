import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Classroom, ClassroomDocument } from '../classrooms/schemas/classroom.schema.js';
import { SharePdfDto } from './dto/share-pdf.dto.js';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<ClassroomDocument>,
  ) {}

  async sharePdf(classroomId: string, dto: SharePdfDto) {
    const classroom = await this.classroomModel.findById(new Types.ObjectId(classroomId));
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    const activePdf = {
      fileName: dto.fileName,
      fileUrl: dto.fileUrl || '',
      totalPages: dto.totalPages,
      currentPage: 1,
    };

    classroom.activePdf = activePdf;
    await classroom.save();

    this.logger.log(`PDF shared in classroom ${classroomId}: ${dto.fileName}`);
    return activePdf;
  }

  async changePage(classroomId: string, page: number) {
    const classroom = await this.classroomModel.findById(new Types.ObjectId(classroomId));
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    if (!classroom.activePdf) {
      throw new BadRequestException('No active PDF is currently being shared');
    }

    if (page < 1 || page > classroom.activePdf.totalPages) {
      throw new BadRequestException(
        `Invalid page number ${page}. Page must be between 1 and ${classroom.activePdf.totalPages}`,
      );
    }

    classroom.activePdf.currentPage = page;
    classroom.markModified('activePdf');
    await classroom.save();

    this.logger.log(`PDF page changed in classroom ${classroomId} to page: ${page}`);
    return classroom.activePdf;
  }

  async closePdf(classroomId: string) {
    const classroom = await this.classroomModel.findById(new Types.ObjectId(classroomId));
    if (!classroom) {
      throw new NotFoundException('Classroom not found');
    }

    classroom.activePdf = null;
    await classroom.save();

    this.logger.log(`PDF closed in classroom ${classroomId}`);
    return true;
  }
}
