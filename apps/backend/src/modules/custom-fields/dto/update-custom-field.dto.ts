import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from '../custom-field-validation';

/**
 * 更新字段定义。key 与 entityType 不允许修改——它们是值存储的定位依据，
 * 改动会导致历史值失联，需要新建字段替代。
 */
export class UpdateCustomFieldDto {
  @ApiPropertyOptional({ description: '展示名' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ enum: CUSTOM_FIELD_TYPES, description: '字段类型（仅允许同族切换）' })
  @IsOptional()
  @IsIn([...CUSTOM_FIELD_TYPES])
  type?: CustomFieldType;

  @ApiPropertyOptional({ description: 'SELECT / MULTI_SELECT 的选项' })
  @IsOptional()
  @IsArray()
  options?: unknown[];

  @ApiPropertyOptional({ description: '是否必填' })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: '默认值' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ description: '说明文案' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ description: '排序值' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否启用（false 为归档）' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
