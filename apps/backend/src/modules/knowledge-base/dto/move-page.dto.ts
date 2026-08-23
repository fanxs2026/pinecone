import { IsOptional, IsUUID, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MovePageDto {
  @ApiPropertyOptional({ description: 'New parent page ID (null for root level)' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'New sort order position' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
