import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// G1 知识库 P1-A：KbPage ↔ 研发工作项关联 DTO（2026-08-16）

export const KB_LINK_ENTITY_TYPES = ['IDEA', 'FEATURE', 'STORY', 'SUPPORT', 'RELEASE', 'TEST_CASE'] as const;
export const KB_LINK_TYPES = ['REFERENCE', 'GENERATED_FROM', 'SUPPORTS'] as const;

export class LinkEntityDto {
  @ApiProperty({ enum: KB_LINK_ENTITY_TYPES })
  @IsIn(KB_LINK_ENTITY_TYPES)
  entityType!: string;

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiPropertyOptional({ enum: KB_LINK_TYPES })
  @IsOptional()
  @IsIn(KB_LINK_TYPES)
  linkType?: string;
}

export class SearchEntitiesDto {
  @ApiProperty({ enum: KB_LINK_ENTITY_TYPES })
  @IsIn(KB_LINK_ENTITY_TYPES)
  entityType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

export class CreatePageFromEntityDto {
  @ApiProperty({ enum: KB_LINK_ENTITY_TYPES })
  @IsIn(KB_LINK_ENTITY_TYPES)
  entityType!: string;

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
