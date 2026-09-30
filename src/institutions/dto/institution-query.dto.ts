import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { InstitutionRole } from '@prisma/client';

export class InstitutionRoleQueryDto {
  @ApiPropertyOptional({
    enum: InstitutionRole,
    description: 'Filter by member or request role (TEACHER or STUDENT)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase().trim() : value))
  @IsEnum(InstitutionRole)
  role?: InstitutionRole;
}

export class InstitutionSearchQueryDto {
  @ApiPropertyOptional({
    example: 'abc',
    description: 'Search keyword matching institution name or code',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  q?: string;
}
