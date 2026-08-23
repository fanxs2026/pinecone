import { IsString, IsOptional, IsInt, Min, MaxLength, IsUUID, IsIn, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const KB_PAGE_VISIBILITIES = ['SPACE', 'PRIVATE'] as const;
export const KB_ROLE_WHITELIST = ['VIEWER', 'MEMBER', 'ADMIN'] as const;

export class UpdatePageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional({ description: 'Tiptap/ProseMirror JSON content' })
  @IsOptional()
  content?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentText?: string;

  @ApiPropertyOptional({ enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  // G1 知识库 P1-B：页面级权限（SPACE 继承空间 / PRIVATE 角色白名单）
  @ApiPropertyOptional({ enum: KB_PAGE_VISIBILITIES })
  @IsOptional()
  @IsIn(KB_PAGE_VISIBILITIES)
  visibility?: string;

  @ApiPropertyOptional({ type: [String], enum: KB_ROLE_WHITELIST })
  @IsOptional()
  @IsArray()
  @IsIn(KB_ROLE_WHITELIST, { each: true })
  allowedRoleIds?: string[];
}
