import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CUSTOM_FIELD_ENTITY_TYPES, type CustomFieldEntityType } from '../../custom-fields/dto/create-custom-field.dto';

export class CreateSavedViewDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITY_TYPES, description: '所属实体类型' })
  @IsIn([...CUSTOM_FIELD_ENTITY_TYPES])
  entityType!: CustomFieldEntityType;

  @ApiProperty({ description: '视图名称，同工作区同实体类型内唯一', example: '本周待评审' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({
    description: '筛选条件，结构与列表查询参数 cf 一致',
    example: { status: ['OPEN'], customFields: { env: ['prod'] } },
  })
  @IsObject()
  filters!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '列配置：内置列标识或 cf:<字段key>，缺省表示使用默认列',
    example: ['code', 'title', 'status', 'cf:env'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  columns?: string[];

  @ApiPropertyOptional({ description: '是否共享给工作区其他成员', default: false })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @ApiPropertyOptional({ description: '排序值，越小越靠前' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateSavedViewDto {
  @ApiPropertyOptional({ description: '视图名称' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ description: '筛选条件' })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '列配置' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  columns?: string[];

  @ApiPropertyOptional({ description: '是否共享' })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @ApiPropertyOptional({ description: '排序值' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
