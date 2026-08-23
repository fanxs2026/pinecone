import { IsString, IsOptional, IsDateString, IsInt, Min, MaxLength, MinLength, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReleaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  version?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  stageDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  productionDate?: string;

  @ApiProperty({ required: false, description: '周期总产能（人天）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  totalCapacity?: number;

  @ApiProperty({ required: false, description: 'G8 甘特依赖：本发布依赖的发布 id（可选）' })
  @IsOptional()
  @IsUUID()
  dependsOnId?: string;
}
