import { IsString, IsUUID, IsNumber, IsBoolean, IsOptional, Min, MaxLength, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTimeEntryDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  storyId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  entityType?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  entityId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  hours!: number;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  billable?: boolean;
}
