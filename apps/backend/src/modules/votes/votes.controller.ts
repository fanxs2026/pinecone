import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { VotesService } from './votes.service';
import { CreateVoteDto } from './dto/create-vote.dto';

@ApiTags('Votes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/votes')
export class VotesController {
  constructor(private votesService: VotesService) {}

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Vote for an idea/support/feature' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateVoteDto, @Req() req: any) {
    return this.votesService.create(wsId, dto.entityType, dto.entityId, req.user.id);
  }

  @Delete()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Remove own vote' })
  remove(@Param('wsId') wsId: string, @Body() dto: CreateVoteDto, @Req() req: any) {
    return this.votesService.remove(wsId, dto.entityType, dto.entityId, req.user.id);
  }

  @Get('counts')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Vote counts for a set of entities (ids comma-separated)' })
  counts(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Query('ids') ids?: string,
  ) {
    return this.votesService.counts(wsId, entityType, (ids ?? '').split(',').filter(Boolean));
  }
}
