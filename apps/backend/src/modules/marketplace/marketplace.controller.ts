import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MarketplaceService } from './marketplace.service';
import type { Request } from 'express';

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:wsId/marketplace')
export class MarketplaceController {
  constructor(private marketplaceService: MarketplaceService) {}

  @Get('plugins')
  @Roles('VIEWER')
  @ApiOperation({ summary: 'I11 插件清单 + 当前工作区安装状态' })
  list(@Param('wsId') wsId: string) {
    return this.marketplaceService.list(wsId);
  }

  @Get('installed')
  @Roles('VIEWER')
  @ApiOperation({ summary: 'I11 已安装插件列表' })
  installed(@Param('wsId') wsId: string) {
    return this.marketplaceService.installed(wsId);
  }

  @Post('plugins/:pluginId/install')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'I11 安装插件' })
  install(@Param('wsId') wsId: string, @Param('pluginId') pluginId: string, @Req() req: Request) {
    const userId = (req.user as any)?.sub || (req.user as any)?.id;
    return this.marketplaceService.install(wsId, pluginId, userId);
  }

  @Delete('plugins/:pluginId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'I11 卸载插件' })
  uninstall(@Param('wsId') wsId: string, @Param('pluginId') pluginId: string) {
    return this.marketplaceService.uninstall(wsId, pluginId);
  }
}
