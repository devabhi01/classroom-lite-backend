import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinByCodeDto {
  @ApiProperty({
    example: 'TDP82K4',
    description: 'Unique institution code to join',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Institution code is required' })
  @Length(4, 20, { message: 'Institution code must be between 4 and 20 characters' })
  code: string;
}
