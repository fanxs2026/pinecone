import { IsString, IsOptional, IsUUID, MinLength, MaxLength, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeatureDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  releaseId?: string | null;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  priority?: string;
  @IsOptional()
  @IsUUID()
  parentFeatureId?: string;
  @IsOptional()
  @IsBoolean()
  isEpic?: boolean;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  assigneeName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  effortEstimate?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  effortUnit?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
