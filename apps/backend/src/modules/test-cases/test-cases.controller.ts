import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TestCasesService } from './test-cases.service';
import { CreateTestCaseDto } from './dto/create-test-case.dto';
import { UpdateTestCaseDto } from './dto/update-test-case.dto';
import { MarkTestRunDto } from './dto/mark-test-run.dto';

@ApiTags('Test Cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/test-cases')
export class TestCasesController {
  constructor(private service: TestCasesService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List test cases (filter by release/story/status/search)' })
  findAll(
    @Param('wsId') wsId: string,
    @Query('releaseId') releaseId?: string,
    @Query('storyId') storyId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(wsId, { releaseId, storyId, status, search });
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a test case' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateTestCaseDto, @Req() req: any) {
    return this.service.create(wsId, dto, req.user.id);
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get test case detail (with run history)' })
  findOne(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.service.findOne(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update a test case' })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateTestCaseDto, @Req() req: any) {
    return this.service.update(wsId, id, dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a test case' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Req() req: any) {
    return this.service.remove(wsId, id, req.user.id);
  }

  @Post(':id/runs')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Mark test run result (PASS/FAIL/BLOCKED), upsert per release' })
  markRun(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: MarkTestRunDto, @Req() req: any) {
    return this.service.markRun(wsId, id, dto, req.user.id);
  }

  @Post(':id/runs/:runId/defect')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'One-click create defect from failed run (with backlink)' })
  createDefect(@Param('wsId') wsId: string, @Param('id') id: string, @Param('runId') runId: string, @Req() req: any) {
    return this.service.createDefectFromRun(wsId, id, runId, req.user.id);
  }
}
