import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyEmailDto {
  @ApiProperty({ example: 'student@tdpclassroom.com', description: 'User email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: '123456', description: '6-digit verification OTP' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;
}
