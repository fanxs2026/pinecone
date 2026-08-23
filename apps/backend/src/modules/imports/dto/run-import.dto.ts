import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export interface ColumnMapping {
  field: string;
  /** 可选：自定义值映射（from -> to），未命中走内置默认映射 */
  valueMap?: Record<string, string>;
}

export class RunImportDto {
  @ApiProperty({
    description: '字段映射：CSV 列 index(从 0 起) → { field, valueMap? }',
    example: { '0': { field: 'title' }, '1': { field: 'priority' }, '2': { field: 'status' } },
  })
  @IsObject()
  mapping!: Record<string, ColumnMapping>;

  @IsOptional()
  @IsObject()
  @ApiProperty({ required: false })
  defaults?: Record<string, unknown>;
}
