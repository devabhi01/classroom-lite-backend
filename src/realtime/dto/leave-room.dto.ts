import { IsNotEmpty, IsString, Length } from 'class-validator';

export class LeaveRoomDto {
  @IsString()
  @IsNotEmpty({ message: 'classroomCode is required' })
  @Length(6, 6, { message: 'classroomCode must be exactly 6 characters' })
  classroomCode: string;
}
