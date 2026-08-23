import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SortStoryDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
