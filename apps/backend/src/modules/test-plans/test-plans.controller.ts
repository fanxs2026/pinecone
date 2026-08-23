import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TestPlansService } from './test-plans.service';
import { CreateTestPlanDto } from './dto/create-test-plan.dto';
import { AddPlanCasesDto } from './dto/add-plan-cases.dto';

interface AuthedRequest extends Request {
  user?: { id: string; email: string; name?: string; [k: string]: any };
}

export class UpdateTestPlanStatusDto {
  @IsIn(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'])
  status!: string;
}

@ApiTags('Test Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/test-plans')
export class TestPlansController {
  constructor(private service: TestPlansService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List test plans (optional ?releaseId=)' })
  list(@Param('wsId') wsId: string, @Query('releaseId') releaseId?: string) {
    return this.service.list(wsId, releaseId);
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a test plan (named test batch)' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateTestPlanDto, @Req() req: AuthedRequest) {
    return this.service.create(wsId, dto, req.user!.id);
  }

  @Get(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get test plan detail (cases + progress summary)' })
  get(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.service.get(wsId, id);
  }

  @Patch(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update test plan' })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: Partial<CreateTestPlanDto>) {
    return this.service.update(wsId, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update plan status (DRAFT/ACTIVE/COMPLETED/ARCHIVED)' })
  updateStatus(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateTestPlanStatusDto) {
    return this.service.updateStatus(wsId, id, dto.status);
  }

  @Delete(':id')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Soft-delete test plan' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.service.remove(wsId, id);
  }

  @Post(':id/cases')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Add cases to plan (by ids or batch by releaseId)' })
  addCases(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: AddPlanCasesDto) {
    return this.service.addCases(wsId, id, dto);
  }

  @Delete(':id/cases/:testCaseId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Remove a case from plan' })
  removeCase(@Param('wsId') wsId: string, @Param('id') id: string, @Param('testCaseId') testCaseId: string) {
    return this.service.removeCase(wsId, id, testCaseId);
  }

  // ── P1-B：手动走查 ──

  @Post(':id/start-run')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Start a walkthrough run from plan (reset cases to UNTESTED for a release)' })
  startRun(
    @Param('wsId') wsId: string,
    @Param('id') id: string,
    @Query('releaseId') releaseId: string,
    @Req() req: AuthedRequest,
  ) {
    if (!releaseId) throw new BadRequestException('releaseId is required');
    return this.service.startRun(wsId, id, releaseId, req.user!.id);
  }

  @Get(':id/walkthrough')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Walkthrough data: cases with steps + run status (prev/next navigation)' })
  walkthrough(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.service.walkthrough(wsId, id);
  }
}
