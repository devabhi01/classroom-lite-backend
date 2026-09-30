import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ClassroomType } from '@prisma/client';

export class CreateClassroomDto {
  @ApiProperty({
    example: 'Java Programming',
    description: 'Title / name of the classroom',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: 'Classroom name is required' })
  @MinLength(3, { message: 'Classroom name must be at least 3 characters' })
  @MaxLength(100, { message: 'Classroom name cannot exceed 100 characters' })
  name: string;

  @ApiProperty({
    enum: ClassroomType,
    default: ClassroomType.INDEPENDENT,
    required: false,
    description: 'Classroom type: INDEPENDENT or INSTITUTION',
  })
  @IsOptional()
  @IsEnum(ClassroomType)
  type?: ClassroomType;

  @ApiProperty({
    example: 'd8c47f7d-9839-4b29-c9ef-6c41b80456aa',
    required: false,
    description: 'Institution ID (required when type is INSTITUTION)',
  })
  @IsOptional()
  @IsString()
  institutionId?: string;
}
