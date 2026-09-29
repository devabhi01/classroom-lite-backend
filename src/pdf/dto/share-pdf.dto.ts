import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SharePdfDto {
  @IsString()
  @IsOptional()
  classroomCode?: string;

  @IsString()
  fileName: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsNumber()
  @Min(1, { message: 'totalPages must be at least 1' })
  totalPages: number;
}
