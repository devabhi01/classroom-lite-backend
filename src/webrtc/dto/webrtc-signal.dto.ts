import { IsNotEmpty, IsString } from 'class-validator';

export class WebrtcSignalDto {
  @IsString()
  @IsNotEmpty({ message: 'targetUserId is required' })
  targetUserId: string;

  @IsNotEmpty({ message: 'Signaling data payload is required' })
  data: any;
}
