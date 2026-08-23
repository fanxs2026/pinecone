import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CreateStoryDto } from './create-story.dto';
import { STORY_STATUSES } from '../../../common/constants/entity-statuses';

export class UpdateStoryDto extends PartialType(CreateStoryDto) {
  @ApiProperty({ required: false, enum: STORY_STATUSES, description: 'Kanban 列状态切换' })
  @IsString()
  @IsOptional()
  @IsIn(STORY_STATUSES)
  status?: string;
}
