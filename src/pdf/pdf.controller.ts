import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

const uploadDir = join(process.cwd(), 'uploads', 'pdf');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('pdf')
export class PdfController {
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: (error: Error | null, destination: string) => void) => {
          cb(null, uploadDir);
        },
        filename: (_req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname).toLowerCase() || '.pdf';
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (_req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
        if (
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are allowed!'), false);
        }
      },
    }),
  )
  uploadPdf(@UploadedFile() file: any, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('No PDF file uploaded');
    }

    const host = req.get('host');
    const protocol = req.protocol || 'http';
    const fileUrl = `${protocol}://${host}/uploads/pdf/${file.filename}`;

    return {
      success: true,
      data: {
        fileName: file.originalname,
        fileUrl,
        relativePath: `/uploads/pdf/${file.filename}`,
        size: file.size,
      },
    };
  }
}
