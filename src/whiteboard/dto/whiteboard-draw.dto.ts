import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class WhiteboardDrawDto {
  @IsNumber()
  x1: number;

  @IsNumber()
  y1: number;

  @IsNumber()
  x2: number;

  @IsNumber()
  y2: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsNumber()
  @Min(1)
  width: number;
}
