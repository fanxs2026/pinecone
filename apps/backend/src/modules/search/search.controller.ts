import { Controller, Get, Query, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('workspaces/:wsId/search')
@UseGuards(WorkspaceRoleGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @Roles('VIEWER')
  @ApiOperation({ summary: '跨实体全局搜索（Cmd+K）' })
  async search(
    @Param('wsId') wsId: string,
    @Query('q') q: string,
    @Req() req: any,
  ) {
    return this.searchService.globalSearch(wsId, q, {
      userId: req.user.id,
      role: req.workspaceMember.role,
    });
  }
}
