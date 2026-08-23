import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Req, UploadedFile, UseInterceptors, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiProduces } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ImportsService } from './imports.service';
import { UploadCsvDto } from './dto/upload-csv.dto';
import { RunImportDto } from './dto/run-import.dto';
import type { Response } from 'express';

interface AuthedRequest extends Request {
  user?: { id: string; email: string; name?: string; [k: string]: any };
}

@ApiTags('Imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/imports')
export class ImportsController {
  constructor(private service: ImportsService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List import jobs' })
  list(@Param('wsId') wsId: string) {
    return this.service.list(wsId);
  }

  // 2026-08-14：Excel 模板下载（含下拉验证 + 字段说明注释）
  @Get('template')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Download Excel import template (with dropdown validation & field notes)' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async template(
    @Param('wsId') wsId: string,
    @Query('entityType') entityType: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const et = (entityType || 'SUPPORT').toUpperCase() as 'IDEA' | 'SUPPORT' | 'TEST_CASE';
    const file = await this.service.generateTemplate(et);
    const filename = `template-${et.toLowerCase()}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return file;
  }

  @Post('csv/upload')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload CSV for preview (parses + sanitizes, returns column headers & preview)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['IDEA', 'SUPPORT', 'TEST_CASE'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  upload(
    @Param('wsId') wsId: string,
    @Body() dto: UploadCsvDto,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.service.upload(wsId, dto, file, req.user!.id);
  }

  @Post(':jobId/run')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Run import with field mapping (returns row-level report)' })
  run(@Param('wsId') wsId: string, @Param('jobId') jobId: string, @Body() dto: RunImportDto, @Req() req: AuthedRequest) {
    return this.service.run(wsId, jobId, dto.mapping, dto.defaults ?? {}, req.user!.id);
  }

  @Get(':jobId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'Get import job detail (status / report / errors)' })
  get(@Param('wsId') wsId: string, @Param('jobId') jobId: string) {
    return this.service.get(wsId, jobId);
  }
}
