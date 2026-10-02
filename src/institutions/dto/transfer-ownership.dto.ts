import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  @ApiProperty({
    description: 'The UUID of the teacher member who will become the new institution owner',
    example: 'd9b2d63d-a233-4123-8478-83141f238210',
  })
  @IsUUID('4', { message: 'newOwnerId must be a valid UUID' })
  @IsNotEmpty({ message: 'newOwnerId is required' })
  newOwnerId: string;
}
