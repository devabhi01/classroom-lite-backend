import { IsOptional, IsString } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsOptional()
  classroomCode?: string;

  @IsString()
  @IsOptional()
  code?: string;
}
