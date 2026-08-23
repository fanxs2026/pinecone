import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const IMPORT_ENTITY_TYPES = ['IDEA', 'SUPPORT', 'TEST_CASE'] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export class UploadCsvDto {
  @ApiProperty({ enum: IMPORT_ENTITY_TYPES })
  @IsIn(IMPORT_ENTITY_TYPES)
  entityType!: ImportEntityType;
}
