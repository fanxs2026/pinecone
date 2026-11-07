import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SavedViewsService } from './saved-views.service';
import { CreateSavedViewDto, UpdateSavedViewDto } from './dto/saved-view.dto';

@ApiTags('SavedViews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:wsId/saved-views')
export class SavedViewsController {
  constructor(private savedViewsService: SavedViewsService) {}

  @Get()
  @Roles('VIEWER')
  @ApiParam({ name: 'wsId', description: '工作区 ID' })
  @ApiOperation({
    summary: '视图列表',
    description: '返回共享视图与当前用户自己的个人视图，附带 isMine 标记。',
  })
  findAll(@Param('wsId') wsId: string, @Query('entityType') entityType: string, @Req() req: any) {
    return this.savedViewsService.findAll(wsId, entityType, req.user.id);
  }

  @Post()
  @Roles('MEMBER')
  @ApiOperation({ summary: '保存当前筛选与列配置为视图' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateSavedViewDto, @Req() req: any) {
    return this.savedViewsService.create(wsId, dto, req.user.id);
  }

  @Patch(':id')
  @Roles('MEMBER')
  @ApiOperation({ summary: '更新视图（仅创建者）' })
  update(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSavedViewDto,
    @Req() req: any,
  ) {
    return this.savedViewsService.update(wsId, id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles('MEMBER')
  @ApiOperation({ summary: '删除视图（仅创建者）' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Req() req: any) {
    return this.savedViewsService.remove(wsId, id, req.user.id);
  }
}
