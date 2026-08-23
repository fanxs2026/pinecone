import { IsIn, IsOptional, IsArray, ValidateNested, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ScoringDimensionDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsNumber()
  weight!: number;

  @IsNumber()
  scale!: number;
}

export class UpdateScoringConfigDto {
  @IsOptional()
  @IsIn(['RICE', 'ICE', 'CUSTOM'])
  model?: 'RICE' | 'ICE' | 'CUSTOM';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoringDimensionDto)
  dimensions?: ScoringDimensionDto[];
}
