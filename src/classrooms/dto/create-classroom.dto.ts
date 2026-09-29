import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

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
}
