import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SortFeatureDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
