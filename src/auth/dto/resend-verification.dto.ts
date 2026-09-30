import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ResendVerificationDto {
  @ApiProperty({ example: 'student@tdpclassroom.com', description: 'User email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
