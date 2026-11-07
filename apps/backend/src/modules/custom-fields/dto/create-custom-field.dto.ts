import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from '../custom-field-validation';

/** 自定义属性支持的实体类型（与值列所在的四张表一致） */
export const CUSTOM_FIELD_ENTITY_TYPES = ['IDEA', 'FEATURE', 'STORY', 'SUPPORT'] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export class CreateCustomFieldDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITY_TYPES, description: '所属实体类型' })
  @IsIn([...CUSTOM_FIELD_ENTITY_TYPES])
  entityType!: CustomFieldEntityType;

  @ApiProperty({ description: '机器名，工作区内同实体类型下唯一', example: 'affect_version' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,39}$/, {
    message: 'key 需以小写字母开头，只能包含小写字母、数字与下划线，长度 1-40',
  })
  key!: string;

  @ApiProperty({ description: '展示名', example: '影响版本' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;

  @ApiProperty({ enum: CUSTOM_FIELD_TYPES, description: '字段类型' })
  @IsIn([...CUSTOM_FIELD_TYPES])
  type!: CustomFieldType;

  @ApiPropertyOptional({
    description: 'SELECT / MULTI_SELECT 的选项',
    example: [{ value: 'prod', label: '生产' }],
  })
  @IsOptional()
  @IsArray()
  options?: unknown[];

  @ApiPropertyOptional({ description: '是否必填', default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: '默认值（需与类型匹配）' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ description: '说明文案，展示在控件下方' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ description: '排序值，越小越靠前', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否启用（false 为归档，保留历史值但不占配额）', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
