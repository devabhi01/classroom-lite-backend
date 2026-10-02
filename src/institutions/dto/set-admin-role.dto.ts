import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class SetAdminRoleDto {
  @ApiProperty({
    description: 'Set true to appoint as Administrator, or false to revert to regular Teacher',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  isAdmin: boolean;
}
