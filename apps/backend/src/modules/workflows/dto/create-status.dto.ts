import { IsString, IsOptional, IsInt, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStatusDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiProperty({ required: false, default: '#6B7280' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiProperty({ required: false, default: 'CUSTOM' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ required: false, description: 'WIP 上限（null = 不限）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  wipLimit?: number | null;
}
