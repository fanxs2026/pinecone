import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AddTagDto } from './dto/add-tag.dto';
import { UpsertTagDto } from './dto/upsert-tag.dto';
import { LinkEntityDto, CreatePageFromEntityDto } from './dto/kb-link.dto';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/kb')
export class KnowledgeBaseController {
  constructor(private kbService: KnowledgeBaseService) {}

  // ============================================================
  // Spaces
  // ============================================================

  @Get('spaces')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List KB spaces' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  listSpaces(
    @Param('wsId') wsId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.kbService.listSpaces(wsId, Number(skip) || 0, Number(take) || 50);
  }

  @Get('spaces/:spaceId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get KB space' })
  getSpace(@Param('wsId') wsId: string, @Param('spaceId') spaceId: string) {
    return this.kbService.getSpace(wsId, spaceId);
  }

  @Post('spaces')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create KB space' })
  createSpace(@Param('wsId') wsId: string, @Body() dto: CreateSpaceDto, @Req() req: any) {
    return this.kbService.createSpace(wsId, dto, req.user.id);
  }

  @Patch('spaces/:spaceId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update KB space' })
  updateSpace(@Param('wsId') wsId: string, @Param('spaceId') spaceId: string, @Body() dto: UpdateSpaceDto) {
    return this.kbService.updateSpace(wsId, spaceId, dto);
  }

  @Delete('spaces/:spaceId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete KB space (soft)' })
  deleteSpace(@Param('wsId') wsId: string, @Param('spaceId') spaceId: string) {
    return this.kbService.deleteSpace(wsId, spaceId);
  }

  // ============================================================
  // Pages
  // ============================================================

  @Get('pages')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List pages (optionally filter by spaceId or parentId)' })
  @ApiQuery({ name: 'spaceId', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  listPages(
    @Param('wsId') wsId: string,
    @Query('spaceId') spaceId?: string,
    @Query('parentId') parentId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Req() req?: any,
  ) {
    return this.kbService.listPages(wsId, spaceId, parentId, Number(skip) || 0, Number(take) || 50, req?.workspaceMember?.role);
  }

  @Get('spaces/:spaceId/pages')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List all pages in a space (flat, for tree)' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  listAllPagesInSpace(
    @Param('wsId') wsId: string,
    @Param('spaceId') spaceId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Req() req?: any,
  ) {
    return this.kbService.listAllPagesInSpace(wsId, spaceId, Number(skip) || 0, Number(take) || 500, req?.workspaceMember?.role);
  }

  @Get('pages/:pageId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get a page' })
  getPage(@Param('wsId') wsId: string, @Param('pageId') pageId: string, @Req() req: any) {
    return this.kbService.getPage(wsId, pageId, req.workspaceMember?.role);
  }

  @Post('pages')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a page' })
  createPage(@Param('wsId') wsId: string, @Body() dto: CreatePageDto, @Req() req: any) {
    return this.kbService.createPage(wsId, dto, req.user.id);
  }

  @Patch('pages/:pageId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a page' })
  updatePage(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Body() dto: UpdatePageDto,
    @Req() req: any,
  ) {
    return this.kbService.updatePage(wsId, pageId, dto, req.user.id, req.workspaceMember?.role);
  }

  @Delete('pages/:pageId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a page (soft, cascades to children)' })
  deletePage(@Param('wsId') wsId: string, @Param('pageId') pageId: string, @Req() req: any) {
    return this.kbService.deletePage(wsId, pageId, req.workspaceMember?.role);
  }

  // ============================================================
  // Comments
  // ============================================================

  @Get('pages/:pageId/comments')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List comments on a page' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  listComments(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.kbService.listComments(wsId, pageId, Number(skip) || 0, Number(take) || 50);
  }

  @Post('comments')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Add a comment to a page' })
  createComment(@Param('wsId') wsId: string, @Body() dto: CreateCommentDto, @Req() req: any) {
    return this.kbService.createComment(wsId, dto, req.user.id);
  }

  @Delete('comments/:commentId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete a comment' })
  deleteComment(
    @Param('wsId') wsId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    return this.kbService.deleteComment(wsId, commentId, req.user.id);
  }

  // ============================================================
  // Tags
  // ============================================================

  @Get('tags')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List all KB tags' })
  listTags(@Param('wsId') wsId: string) {
    return this.kbService.listTags(wsId);
  }

  @Post('pages/:pageId/tags')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Add a tag to a page' })
  addTag(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Body() dto: AddTagDto,
  ) {
    return this.kbService.addTagToPage(wsId, pageId, dto.tagId);
  }

  @Delete('pages/:pageId/tags/:tagId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Remove a tag from a page' })
  removeTag(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.kbService.removeTagFromPage(wsId, pageId, tagId);
  }

  @Post('tags')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create or update a tag' })
  upsertTag(
    @Param('wsId') wsId: string,
    @Body() dto: UpsertTagDto,
  ) {
    return this.kbService.upsertTag(wsId, dto.name, dto.color);
  }

  // ============================================================
  // Templates
  // ============================================================

  @Get('templates')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List template pages' })
  getTemplates(@Param('wsId') wsId: string) {
    return this.kbService.getTemplates(wsId);
  }

  @Post('templates/:templateId/use')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a page from a template' })
  createFromTemplate(
    @Param('wsId') wsId: string,
    @Param('templateId') templateId: string,
    @Body() dto: CreatePageDto,
    @Req() req: any,
  ) {
    return this.kbService.createFromTemplate(wsId, templateId, dto, req.user.id);
  }

  // ============================================================
  // Search
  // ============================================================

  @Get('search')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Search pages by keyword' })
  search(
    @Param('wsId') wsId: string,
    @Query('q') q: string,
    @Req() req: any,
  ) {
    return this.kbService.search(wsId, q || '', req.workspaceMember?.role);
  }

  // ============================================================
  // G1 知识库 P1-A：KbPage ↔ 研发工作项双向关联
  // ============================================================

  @Get('pages/:pageId/links')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Page 关联的工作项列表' })
  listPageLinks(@Param('wsId') wsId: string, @Param('pageId') pageId: string) {
    return this.kbService.listPageLinks(wsId, pageId);
  }

  @Post('pages/:pageId/links')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: '添加工作项关联到页面' })
  linkEntity(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Body() dto: LinkEntityDto,
    @Req() req: any,
  ) {
    return this.kbService.linkEntityToPage(wsId, pageId, dto, req.user.id);
  }

  @Delete('pages/:pageId/links/:linkId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: '移除页面关联' })
  removeLink(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.kbService.removePageLink(wsId, pageId, linkId);
  }

  @Get('entity-pages')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: '反向查询：实体的相关知识页面' })
  listEntityPages(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.kbService.listEntityPages(wsId, entityType, entityId);
  }

  @Get('entity-search')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: '实体搜索（关联选择器）' })
  searchEntities(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('q') q?: string,
  ) {
    return this.kbService.searchEntities(wsId, entityType, q);
  }

  @Post('pages/from-entity')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: '从工作项一键沉淀知识库页面（GENERATED_FROM）' })
  createPageFromEntity(
    @Param('wsId') wsId: string,
    @Body() dto: CreatePageFromEntityDto,
    @Req() req: any,
  ) {
    return this.kbService.createPageFromEntity(wsId, dto, req.user.id);
  }

  // ============================================================
  // G1 知识库 P2-A：版本历史 / 回滚
  // ============================================================

  @Get('pages/:pageId/versions')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: '页面版本历史列表' })
  listPageVersions(@Param('wsId') wsId: string, @Param('pageId') pageId: string) {
    return this.kbService.listPageVersions(wsId, pageId);
  }

  @Post('pages/:pageId/rollback/:version')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: '回滚页面到指定版本' })
  rollbackPage(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Param('version') version: string,
    @Req() req: any,
  ) {
    return this.kbService.rollbackPage(wsId, pageId, Number(version), req.user.id, req.workspaceMember?.role);
  }

  // ============================================================
  // Move / Reorder
  // ============================================================

  @Patch('pages/:pageId/move')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Move page to new parent or reorder' })
  movePage(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Body() dto: any,
  ) {
    return this.kbService.movePage(wsId, pageId, dto);
  }

  // ============================================================
  // Export
  // ============================================================

  @Get('pages/:pageId/export')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Export page as markdown or text' })
  exportPage(
    @Param('wsId') wsId: string,
    @Param('pageId') pageId: string,
    @Query('format') format: string,
  ) {
    return this.kbService.exportPage(wsId, pageId, format || 'markdown');
  }
}
