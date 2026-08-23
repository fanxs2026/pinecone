import { IsString, IsOptional, IsUUID, MinLength, MaxLength, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  SUPPORT_STATUSES,
  SUPPORT_SEVERITIES,
  type SupportStatus,
  type SupportSeverity,
} from '../../../common/constants/entity-statuses';

export const SUPPORT_TYPES = ['SUPPORT_REQUEST', 'DEFECT'] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export class CreateSupportDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, enum: SUPPORT_STATUSES })
  @IsString()
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @ApiProperty({ required: false, enum: SUPPORT_TYPES })
  @IsString()
  @IsIn(SUPPORT_TYPES)
  @IsOptional()
  type?: SupportType;

  @ApiProperty({ required: false, enum: SUPPORT_SEVERITIES, description: '缺陷严重度（type=DEFECT 时有效）' })
  @IsString()
  @IsOptional()
  @IsIn(SUPPORT_SEVERITIES)
  severity?: SupportSeverity;

  @ApiProperty({ required: false, description: '缺陷根因（自由文本，type=DEFECT 时选填）' })
  @IsString()
  @IsOptional()
  rootCause?: string;

  @ApiProperty({ required: false, enum: ['TEST', 'PRODUCTION', 'CUSTOMER'], description: '缺陷发现阶段（type=DEFECT 时选填，逃逸率口径）' })
  @IsString()
  @IsOptional()
  @IsIn(['TEST', 'PRODUCTION', 'CUSTOMER'])
  discoveryPhase?: string;

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
  @IsUUID()
  @IsOptional()
  releaseId?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
