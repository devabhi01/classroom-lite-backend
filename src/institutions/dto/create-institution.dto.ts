import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateInstitutionDto {
  @ApiProperty({
    example: 'ABC Computer Institute',
    description: 'Name of the institution (required)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Institution name is required' })
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'Leading technology and programming education institute',
    required: false,
    description: 'Description of the institution',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'https://example.com/logo.png',
    required: false,
    description: 'Logo URL of the institution',
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({
    example: 'contact@abcinstitute.com',
    required: false,
    description: 'Official contact email',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: '+919876543210',
    required: false,
    description: 'Official contact phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: '123 Tech Park, Knowledge City',
    required: false,
    description: 'Physical address of the institution',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    example: 'https://abcinstitute.com',
    required: false,
    description: 'Official website URL',
  })
  @IsOptional()
  @IsString()
  website?: string;
}
