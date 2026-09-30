import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ResendVerificationDto {
  @ApiProperty({
    example: 'student@example.com',
    required: false,
    description: 'Email address to resend confirmation email to',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsString()
  email?: string;

  @ApiProperty({
    example: '+919876543210',
    required: false,
    description: 'Phone number to resend SMS OTP to',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
