import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SignupDto {
  @ApiProperty({ example: 'Abhishek', description: 'Full name of the user' })
  @Transform(({ obj, value }) => (value || obj.fullName || obj.username || '').trim())
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiProperty({ example: 'abhishek@example.com', description: 'Unique user email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'Password (minimum 6 characters)', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({ example: 'Abhishek', required: false, description: 'Alternative alias for name' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ example: 'abhishek', required: false, description: 'Alternative alias for name' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ example: 'password123', required: false, description: 'Optional password confirmation' })
  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', required: false, description: 'Optional avatar URL' })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  avatar?: string;

  @ApiProperty({ example: 'TEACHER', required: false, description: 'Role of the user (TEACHER or STUDENT)' })
  @IsOptional()
  @IsString()
  role?: string;

  // --- Teacher Institution Options (Part 9, 10, 11) ---
  @ApiProperty({
    example: 'ABC Computer Institute',
    required: false,
    description: 'Teacher signup option: Name to create their own basic institution',
  })
  @IsOptional()
  @IsString()
  institutionName?: string;

  @ApiProperty({
    example: 'd8c47f7d-9839-4b29-c9ef-6c41b80456aa',
    required: false,
    description: 'Teacher signup option: ID of existing institution to request to join',
  })
  @IsOptional()
  @IsString()
  institutionId?: string;

  @ApiProperty({
    example: 'TDP82K4',
    required: false,
    description: 'Teacher signup option: Code of existing institution to request to join',
  })
  @IsOptional()
  @IsString()
  institutionCode?: string;

  // --- Student Institution Options (Part 12, 13) ---
  @ApiProperty({
    example: ['d8c47f7d-9839-4b29-c9ef-6c41b80456aa'],
    required: false,
    description: 'Student signup option: Array of institution IDs to send join requests to',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  institutionIds?: string[];
}
