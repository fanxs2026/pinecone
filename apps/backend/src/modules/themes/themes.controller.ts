import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ThemesService } from './themes.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { LinkEntityDto } from './dto/link-entity.dto';
import { PromoteThemeDto } from './dto/promote-theme.dto';

@ApiTags('Themes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/themes')
export class ThemesController {
  constructor(private themesService: ThemesService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List themes with linked entity count and aggregated votes' })
  findAll(@Param('wsId') wsId: string) {
    return this.themesService.findAll(wsId);
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a theme' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateThemeDto) {
    return this.themesService.create(wsId, dto);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a theme' })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateThemeDto) {
    return this.themesService.update(wsId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Soft-delete a theme' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.themesService.remove(wsId, id);
  }

  @Post(':id/entities')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Link an entity (idea/support/feature) to a theme' })
  link(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.themesService.link(wsId, id, dto.entityType, dto.entityId);
  }

  @Delete(':id/entities')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Unlink an entity from a theme' })
  unlink(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.themesService.unlink(wsId, id, dto.entityType, dto.entityId);
  }

  @Post(':id/promote')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Promote a theme to a Feature or Idea' })
  promote(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: PromoteThemeDto, @Req() req: any) {
    return this.themesService.promote(wsId, id, req.user.id, dto.targetType, dto.releaseId);
  }
}
