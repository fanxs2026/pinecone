import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackPortalService } from './feedback-portal.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { PortalVoteDto } from './dto/portal-vote.dto';
import { UpdatePortalSettingsDto } from './dto/update-portal-settings.dto';

@ApiTags('FeedbackPortal')
@Throttle({ default: { limit: 60, ttl: 60_000 } }) // 公开端点 30/min 另设，工作区侧放宽
@Controller()
export class FeedbackPortalController {
  constructor(private portalService: FeedbackPortalService) {}

  // ===== 公开侧（无 JWT，复用 @Public 模式）=====

  @Get('feedback/:token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public feedback portal: config + feedback list with votes/themes' })
  view(@Param('token') token: string) {
    return this.portalService.view(token);
  }

  @Post('feedback/:token/captcha')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Generate arithmetic captcha (anti-spam)' })
  captcha(@Param('token') token: string) {
    return this.portalService.generateCaptcha(token);
  }

  @Post('feedback/:token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public feedback submission (lands as Support or Idea per workspace config)' })
  submit(@Param('token') token: string, @Body() dto: SubmitFeedbackDto) {
    return this.portalService.submit(token, dto);
  }

  @Post('feedback/:token/vote')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public vote on a feedback item (dedup by email)' })
  vote(@Param('token') token: string, @Body() dto: PortalVoteDto) {
    return this.portalService.vote(token, dto);
  }

  // ===== 工作区侧（门户设置，ADMIN）=====

  @Get('workspaces/:wsId/feedback-portal/settings')
  @UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get feedback portal settings' })
  getSettings(@Param('wsId') wsId: string) {
    return this.portalService.getSettings(wsId);
  }

  @Put('workspaces/:wsId/feedback-portal/settings')
  @UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update feedback portal settings (enabling without token generates one)' })
  updateSettings(@Param('wsId') wsId: string, @Body() dto: UpdatePortalSettingsDto) {
    return this.portalService.updateSettings(wsId, dto);
  }

  @Post('workspaces/:wsId/feedback-portal/token')
  @UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerate feedback portal token (old link invalidated)' })
  regenerateToken(@Param('wsId') wsId: string) {
    return this.portalService.regenerateToken(wsId);
  }
}
