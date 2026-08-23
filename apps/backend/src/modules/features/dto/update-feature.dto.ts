import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CreateFeatureDto } from './create-feature.dto';
import { FEATURE_STATUSES } from '../../../common/constants/entity-statuses';

export class UpdateFeatureDto extends PartialType(CreateFeatureDto) {
  @ApiProperty({ required: false, enum: FEATURE_STATUSES, description: 'Feature 状态切换' })
  @IsString()
  @IsOptional()
  @IsIn(FEATURE_STATUSES)
  status?: string;
}
