import { IsString, MinLength, MaxLength, IsOptional, IsUUID, IsInt, Min, IsObject, IsIn, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePageDto {
  @ApiPropertyOptional({ description: 'Space ID (optional for root pages within a space)' })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Parent page ID for hierarchy' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ example: 'Getting Started Guide' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ example: 'getting-started' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional({ description: 'Tiptap/ProseMirror JSON content' })
  @IsOptional()
  @IsObject()
  content?: any;

  @ApiPropertyOptional({ example: 'draft', enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Plain text version for search' })
  @IsOptional()
  @IsString()
  contentText?: string;

  // G1 知识库 P1-B：页面级权限
  @ApiPropertyOptional({ enum: ['SPACE', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['SPACE', 'PRIVATE'])
  visibility?: string;

  @ApiPropertyOptional({ type: [String], enum: ['VIEWER', 'MEMBER', 'ADMIN'] })
  @IsOptional()
  @IsArray()
  @IsIn(['VIEWER', 'MEMBER', 'ADMIN'], { each: true })
  allowedRoleIds?: string[];
}
