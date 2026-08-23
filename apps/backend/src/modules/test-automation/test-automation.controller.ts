import { Controller, Post, Param, Query, UseGuards, Req, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TestAutomationService } from './test-automation.service';

interface AuthedRequest extends Request {
  user?: { id: string; email: string; name?: string; [k: string]: any };
}

export class JunitImportQuery {
  @IsOptional()
  @IsUUID()
  releaseId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === '1')
  autoCreate?: boolean;
}

@ApiTags('Test Automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/test-automation')
export class TestAutomationController {
  constructor(private service: TestAutomationService) {}

  @Post('junit')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import CI test results from JUnit XML → auto-match/create test cases → create test runs' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async importJunit(
    @Param('wsId') wsId: string,
    @Query() query: JunitImportQuery,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('JUnit XML file is required');
    }
    const xml = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const report = await this.service.importJunit(wsId, xml, { releaseId: query.releaseId, autoCreate: query.autoCreate === true }, req.user!.id);
    return { fileName: file.originalname, ...report };
  }
}
