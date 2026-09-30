import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'd8c47f7d98394b29c9ef6c41b80456aa',
    required: false,
    description: 'Email verification token from email confirmation link',
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({
    example: '123456',
    required: false,
    description: '6-digit verification OTP code from confirmation email',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    example: 'student@example.com',
    required: false,
    description: 'User email (used when verifying via 6-digit OTP code)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsString()
  email?: string;

  @ApiProperty({
    example: '+919876543210',
    required: false,
    description: 'User phone number (used when verifying via 6-digit SMS OTP)',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
