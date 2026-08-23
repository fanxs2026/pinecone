import { IsString, IsOptional, IsUUID, IsInt, Min, Max, MinLength, MaxLength, IsNumber, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STORY_KINDS, type StoryKind } from '../../../common/constants/entity-statuses';

export class CreateStoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsUUID()
  featureId!: string;

  @ApiProperty({ required: false, description: '发布周期（fix version），可空' })
  @IsUUID()
  @IsOptional()
  releaseId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  acceptanceCriteria?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  storyPoints?: number;

  @ApiProperty({ required: false, default: 'P2' })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({ required: false, enum: STORY_KINDS, default: 'FEATURE', description: 'FEATURE | DEFECT | CHORE' })
  @IsString()
  @IsOptional()
  @IsIn(STORY_KINDS)
  kind?: StoryKind;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;
  @IsOptional()
  @IsUUID()
  teamId?: string;
  @IsOptional()
  @IsUUID()
  sprintId?: string;
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  estimateHours?: number;
}
