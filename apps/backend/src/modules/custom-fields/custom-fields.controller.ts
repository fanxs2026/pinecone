import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { ReorderCustomFieldsDto } from './dto/reorder-custom-fields.dto';

@ApiTags('CustomFields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/custom-fields')
export class CustomFieldsController {
  constructor(private customFieldsService: CustomFieldsService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiParam({ name: 'wsId', description: '工作区 ID' })
  @ApiOperation({
    summary: '字段定义列表（含配额）',
    description: '返回 { items, quota }。quota 只统计启用中的字段，归档即释放额度。',
  })
  findAll(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.customFieldsService.findAll(wsId, entityType, includeInactive === 'true');
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '新建字段定义（工作区管理员）' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateCustomFieldDto) {
    return this.customFieldsService.create(wsId, dto);
  }

  // 注意：静态路径必须声明在 :id 之前，否则会被参数路由捕获
  @Patch('reorder')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '批量调整字段顺序' })
  reorder(@Param('wsId') wsId: string, @Body() dto: ReorderCustomFieldsDto) {
    return this.customFieldsService.reorder(wsId, dto);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: '更新字段定义',
    description: 'key 与 entityType 不可修改；类型变更仅允许同族切换。',
  })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFieldsService.update(wsId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: '删除字段定义',
    description: '同时从对应实体的 custom_fields 中剔除该 key，历史值不再保留。',
  })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.customFieldsService.remove(wsId, id);
  }
}
