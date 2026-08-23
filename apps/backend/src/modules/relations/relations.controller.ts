import {
  Controller, Get, Post,
  Body, Param, Query, UseGuards, Req, BadRequestException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RelationsService } from './relations.service';

@ApiTags('Relations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId')
export class RelationsController {
  constructor(private relationsService: RelationsService) {}

  @Post('ideas/:id/promote')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Promote an idea to a feature' })
  promote(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body?: { releaseId?: string; priority?: string },
  ) {
    return this.relationsService.promote(wsId, id, req.user.id, body);
  }

  @Post('features/:id/clone')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Clone a feature to a story' })
  clone(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.relationsService.cloneFeature(wsId, id, req.user.id);
  }

  @Post('supports/:id/clone-to-idea')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Clone a support request to an idea' })
  cloneSupportToIdea(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.relationsService.cloneSupportTo(wsId, id, req.user.id, 'IDEA');
  }

  @Post('supports/:id/clone-to-feature')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Clone a support request to a feature' })
  cloneSupportToFeature(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.relationsService.cloneSupportTo(wsId, id, req.user.id, 'FEATURE');
  }

  @Post('supports/:id/clone-to-story')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Clone a support request to a story' })
  cloneSupportToStory(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body?: { featureId?: string },
  ) {
    return this.relationsService.cloneSupportTo(wsId, id, req.user.id, 'STORY', body);
  }

  @Get('relations')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get related entities' })
  findByEntity(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    // P2-19 修复：非法 UUID → 400（原来直接 500）
    if (!isUUID(entityId)) {
      throw new BadRequestException('entityId must be a valid UUID');
    }
    return this.relationsService.findByEntity(wsId, entityType, entityId);
  }
}
