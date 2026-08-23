import { IsString, MaxLength, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSpaceDto {
  @ApiPropertyOptional({ example: '技术文档' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '📘' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @ApiPropertyOptional({ example: 'Team technical documentation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'member', enum: ['everyone', 'member', 'admin'] })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'member', 'admin'])
  visibility?: string;
}
