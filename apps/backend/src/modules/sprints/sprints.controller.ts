import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SprintsService } from './sprints.service';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

class CreateSprintDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsUUID() releaseId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() goal?: string;
  @IsOptional() @IsIn(['PLANNED', 'ACTIVE', 'COMPLETED']) status?: string;
}

class UpdateSprintDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() releaseId?: string | null;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsString() goal?: string | null;
  @IsOptional() @IsIn(['PLANNED', 'ACTIVE', 'COMPLETED']) status?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

@ApiTags('sprints')
@Controller('workspaces/:wsId/sprints')
@UseGuards(WorkspaceRoleGuard)
export class SprintsController {
  constructor(private readonly service: SprintsService) {}

  @Get()
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List sprints (optionally by release)' })
  list(@Param('wsId') wsId: string, @Query('releaseId') releaseId?: string) {
    return this.service.list(wsId, releaseId);
  }

  @Get(':id/stats')
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Sprint stats (progress / capacity)' })
  stats(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.service.getStats(wsId, id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create sprint' })
  create(@Param('wsId') wsId: string, @Body() dto: CreateSprintDto) {
    return this.service.create(wsId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update sprint' })
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Body() dto: UpdateSprintDto) {
    return this.service.update(wsId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete sprint (blocked if stories attached)' })
  remove(@Param('wsId') wsId: string, @Param('id') id: string) {
    return this.service.remove(wsId, id);
  }
}
