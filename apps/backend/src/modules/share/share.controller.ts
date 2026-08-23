import { Controller, Post, Get, Delete, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ShareService } from './share.service';

class CreateShareDto {
  @IsString()
  entityType!: string;

  @IsString()
  entityId!: string;

  @IsOptional()
  days?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brandTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  brandColor?: string;

  @IsOptional()
  @IsIn(['SIMPLE', 'FULL', 'NARRATIVE'])
  viewMode?: string;
}

@ApiTags('share')
@Controller()
export class ShareController {
  constructor(private shareService: ShareService) {}

  // 成员侧（工作区登录态）
  @Post('workspaces/:wsId/share')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: '创建实体/路线图分享链接（支持品牌标题/主题色/视图模式）' })
  create(
    @Param('wsId') wsId: string,
    @Body() dto: CreateShareDto,
    @Req() req?: any,
  ) {
    return this.shareService.create(
      wsId,
      dto.entityType,
      dto.entityId,
      req.user.id,
      dto.days,
      { brandTitle: dto.brandTitle, brandColor: dto.brandColor, viewMode: dto.viewMode },
    );
  }

  @Delete('workspaces/:wsId/share')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: '撤销实体分享链接' })
  revoke(
    @Param('wsId') wsId: string,
    @Body('entityType') entityType: string,
    @Body('entityId') entityId: string,
  ) {
    return this.shareService.revoke(wsId, entityType, entityId);
  }

  // 公开侧（无 JWT）
  @Get('share/:token')
  @Public()
  @ApiOperation({ summary: '访客通过 token 只读查看实体（无需登录）' })
  view(@Param('token') token: string, @Query('includeSiblings') includeSiblings?: string) {
    return this.shareService.view(token, includeSiblings === 'true');
  }
}
