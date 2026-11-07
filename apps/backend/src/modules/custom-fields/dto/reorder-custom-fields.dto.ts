import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReorderItemDto {
  @ApiProperty({ description: '字段定义 ID' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: '新排序值，越小越靠前' })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderCustomFieldsDto {
  @ApiProperty({ type: [ReorderItemDto], description: '按目标顺序提交的 id 与 sortOrder' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
