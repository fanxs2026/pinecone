import { IsString, IsOptional, IsUUID, MinLength, MaxLength, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTestPlanDto {
  @ApiProperty({ description: '计划名称（如「26.3.1 回归计划」）' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: '关联发布周期；空 = 跨周期专项计划' })
  @IsOptional()
  @IsUUID()
  releaseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
