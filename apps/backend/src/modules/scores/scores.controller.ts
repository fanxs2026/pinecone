import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ScoresService } from './scores.service';
import { UpdateScoringConfigDto } from './dto/update-scoring-config.dto';
import { UpsertScoreDto } from './dto/upsert-score.dto';

@ApiTags('Scores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/scores')
export class ScoresController {
  constructor(private scoresService: ScoresService) {}

  @Get('config')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get workspace scoring config (model + dimensions)' })
  getConfig(@Param('wsId') wsId: string) {
    return this.scoresService.getConfig(wsId);
  }

  @Put('config')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update scoring config (model / custom dimensions)' })
  updateConfig(@Param('wsId') wsId: string, @Body() dto: UpdateScoringConfigDto) {
    return this.scoresService.updateConfig(wsId, dto as any);
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Save score for an entity (RICE/ICE/CUSTOM, reach auto-fills from votes)' })
  upsert(@Param('wsId') wsId: string, @Body() dto: UpsertScoreDto) {
    return this.scoresService.upsert(wsId, dto as any);
  }

  @Delete()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Remove score (fall back to manual priority)' })
  remove(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.scoresService.remove(wsId, entityType, entityId);
  }

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get score for one entity' })
  getByEntity(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.scoresService.getByEntity(wsId, entityType, entityId);
  }

  @Get('history')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'I7 评分历史（趋势曲线数据，按时间正序）' })
  history(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('take') take?: string,
  ) {
    return this.scoresService.history(entityType, entityId, Number(take) || 30);
  }
}
