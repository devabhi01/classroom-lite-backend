import { IsNumber, Min } from 'class-validator';

export class PageChangeDto {
  @IsNumber()
  @Min(1, { message: 'Page must be at least 1' })
  page: number;
}
