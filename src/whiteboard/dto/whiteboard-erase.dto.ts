import { IsNumber, Min } from 'class-validator';

export class WhiteboardEraseDto {
  @IsNumber()
  x1: number;

  @IsNumber()
  y1: number;

  @IsNumber()
  x2: number;

  @IsNumber()
  y2: number;

  @IsNumber()
  @Min(1)
  width: number;
}
