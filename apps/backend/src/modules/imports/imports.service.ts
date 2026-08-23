import { Injectable, BadRequestException, NotFoundException, Logger, StreamableFile } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCsv } from '../../common/utils/csv-parse';
import { sanitizeCsvCell } from '../../common/utils/csv-sanitize';
import { mapValue } from './value-map';
import { withCodeRetry } from '../../common/code-generator';
import { UploadCsvDto, ImportEntityType } from './dto/upload-csv.dto';
import { ColumnMapping } from './dto/run-import.dto';
import { ActivitiesService } from '../activities/activities.service';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
// 2026-08-14：Excel 支持（模板生成 + 解析）；exceljs 是 CJS 包，用 import * as 避免 esModuleInterop 问题
import * as ExcelJS from 'exceljs';

/** 各实体允许导入的字段白名单（防任意字段注入） */
// 2026-08-16：IDEA 移除 category/status、SUPPORT 移除 status——新数据默认 OPEN，
// 状态/分类不应由用户指定（Idea 的 category 是自由文本，无枚举选项）
const ALLOWED_FIELDS: Record<ImportEntityType, string[]> = {
  IDEA: ['title', 'description', 'tags', 'assigneeEmail'],
  SUPPORT: ['title', 'description', 'type', 'tags', 'assigneeEmail', 'releaseName'],
  TEST_CASE: ['title', 'description', 'type', 'expectedResult', 'priority', 'tags', 'storyCode', 'releaseName'],
};

// 2026-08-14：模板元数据（Excel 模板：表头标签/枚举下拉/字段说明/示例值）
const FIELD_LABELS: Record<string, string> = {
  title: '标题', description: '描述', category: '分类', status: '状态', tags: '标签',
  assigneeEmail: '负责人邮箱', type: '类型', releaseName: '发布周期(名称/版本)',
  expectedResult: '预期结果', priority: '优先级', storyCode: '任务编码',
};

/** 枚举字段的可选值（下拉数据验证用；与后端实体枚举一致） */
const FIELD_OPTIONS: Record<ImportEntityType, Record<string, string[]>> = {
  IDEA: {},
  SUPPORT: {
    type: ['SUPPORT_REQUEST', 'DEFECT'],
  },
  TEST_CASE: {
    type: ['FEATURE', 'PERFORMANCE', 'SECURITY', 'API'],
    priority: ['P0', 'P1', 'P2', 'P3'],
  },
};

/** 表头注释（字段说明，Excel note） */
const FIELD_NOTES: Record<ImportEntityType, Record<string, string>> = {
  IDEA: {
    title: '必填。创意/需求标题。',
    tags: '多个标签用英文逗号分隔，如：标签1,标签2',
    assigneeEmail: '负责人邮箱，必须是工作区成员',
  },
  SUPPORT: {
    title: '必填。支持单/缺陷标题。',
    type: '可选值：SUPPORT_REQUEST(咨询) / DEFECT(缺陷)',
    tags: '多个标签用英文逗号分隔',
    assigneeEmail: '负责人邮箱，必须是工作区成员',
    releaseName: '发布周期名称或版本号（可选）',
  },
  TEST_CASE: {
    title: '必填。测试用例标题。',
    type: '可选值：FEATURE(功能) / PERFORMANCE(性能) / SECURITY(安全) / API(接口)',
    expectedResult: '无步骤用例的预期结果',
    priority: '可选值：P0(最高) / P1 / P2 / P3',
    tags: '多个标签用英文逗号分隔',
    storyCode: '关联任务编码，如 PINECONE-T-1（可选）',
    releaseName: '发布周期名称或版本号（可选）',
  },
};

/** 示例行（与前端模板一致；type 按实体枚举取值） */
const SAMPLE_VALUES: Record<ImportEntityType, Record<string, string>> = {
  IDEA: {
    title: '示例标题', description: '示例描述',
    tags: '标签1', assigneeEmail: 'user@example.com',
  },
  SUPPORT: {
    title: '示例标题', description: '示例描述', type: 'SUPPORT_REQUEST',
    tags: '标签1', assigneeEmail: 'user@example.com', releaseName: 'v1.0',
  },
  TEST_CASE: {
    title: '示例标题', description: '示例描述', type: 'FEATURE', expectedResult: '示例预期结果',
    priority: 'P2', tags: '标签1', storyCode: 'PINECONE-T-1', releaseName: 'v1.0',
  },
};

/** 必填字段 */
const REQUIRED_FIELDS: Record<ImportEntityType, string[]> = {
  IDEA: ['title'],
  SUPPORT: ['title'],
  TEST_CASE: ['title'],
};

const PREVIEW_ROWS = 10;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.importJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, entityType: true, fileName: true, rowCount: true,
        status: true, successCount: true, failCount: true, createdAt: true, completedAt: true,
      },
    });
  }

  async get(workspaceId: string, id: string) {
    const job = await this.prisma.importJob.findFirst({ where: { id, workspaceId } });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  /**
   * 上传 + 解析 + 建任务（PREVIEW 状态）：返回列头 + 预览数据 + jobId。
   * 支持 CSV / XLSX（按扩展名分流）；内容做注入清洗（sanitizeCsvCell）——预览即安全。
   */
  async upload(
    workspaceId: string,
    dto: UploadCsvDto,
    file: { originalname: string; buffer: Buffer } | undefined,
    userId: string,
  ) {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('CSV/XLSX file is required');
    }
    // 2026-08-14：Excel 支持——按扩展名分流解析
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    let rows: string[][];
    if (ext === 'xlsx' || ext === 'xls') {
      rows = await this.parseXlsxRows(file.buffer);
    } else {
      // 兼容 UTF-8 BOM
      const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      rows = parseCsv(text);
    }
    if (rows.length < 2) {
      throw new BadRequestException('File must contain a header row and at least one data row');
    }

    const headers = rows[0].map((h) => sanitizeCsvCell(h.trim()));
    if (headers.some((h) => !h)) {
      throw new BadRequestException('CSV header contains empty column names');
    }

    // 完整数据（清洗后）写入 preview——JSONB 可承受常见导入量（≤几千行），
    // 供 run 阶段逐行导入；对外返回只回前 PREVIEW_ROWS 行做预览。
    const allRows = rows.slice(1).map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, sanitizeCsvCell(r[i])])),
    );
    const preview = allRows.slice(0, PREVIEW_ROWS);

    const job = await this.prisma.importJob.create({
      data: {
        workspaceId,
        entityType: dto.entityType,
        fileName: file.originalname,
        columnHeaders: headers,
        rowCount: allRows.length,
        preview: allRows as any, // 完整行（含全部数据）
        status: 'PREVIEW',
        createdById: userId,
      },
    });

    await this.activitiesService.log(
      EntityType.IMPORT_JOB,
      job.id,
      ActionType.CREATED,
      userId,
      workspaceId,
      { entityType: dto.entityType, fileName: file.originalname, rowCount: rows.length - 1 } as any,
    );

    return { id: job.id, entityType: job.entityType, columnHeaders: job.columnHeaders, rowCount: job.rowCount, preview: job.preview };
  }

  /**
   * 2026-08-14：生成导入模板（.xlsx）——表头（英文标识 (中文)）+ 示例行 +
   * 枚举字段下拉验证（dataValidation）+ 表头注释（notes，字段说明）。
   * 让用户按模板填写，合法值只能从下拉选。
   */
  async generateTemplate(entityType: ImportEntityType): Promise<StreamableFile> {
    const fields = ALLOWED_FIELDS[entityType];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('导入模板');

    // 表头（英文标识 (中文)）
    const headerRow = fields.map((f) => `${f} (${FIELD_LABELS[f] ?? f})`);
    ws.addRow(headerRow);
    // 示例行
    ws.addRow(fields.map((f) => SAMPLE_VALUES[entityType][f] ?? ''));

    // 表头样式：加粗 + 底色 + 冻结
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // 枚举下拉验证 + 注释
    fields.forEach((f, i) => {
      // 列字母（模板最多 8 列，A-H 足够；ExcelJS.utils 在部分类型版本缺失，自算）
      const colLetter = String.fromCharCode(65 + i);
      const col = ws.getColumn(i + 1);
      col.width = Math.max(18, (f + (FIELD_LABELS[f] ?? '')).length + 8);

      const options = FIELD_OPTIONS[entityType]?.[f];
      if (options && options.length > 0) {
        // 数据验证：下拉只能选合法值（应用到示例行之下 500 行）
        ws.getCell(2, i + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${options.join(',')}"`],
          showErrorMessage: true,
          errorTitle: '非法值',
          error: `仅允许：${options.join(' / ')}`,
        };
        // 向下批量应用验证（示例行 + 数据行）
        for (let r = 3; r <= 500; r++) {
          ws.getCell(r, i + 1).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${options.join(',')}"`],
            showErrorMessage: true,
            errorTitle: '非法值',
            error: `仅允许：${options.join(' / ')}`,
          };
        }
      }
      // 表头注释：字段说明
      if (FIELD_NOTES[entityType]?.[f]) {
        ws.getCell(1, i + 1).note = {
          texts: [{ text: FIELD_NOTES[entityType][f], font: { size: 10 } }],
          margins: { insetmode: 'auto' },
        };
      }
    });

    // 写出 buffer（exceljs 的 Buffer 是 ArrayBuffer 扩展，转回 Node Buffer）
    const buffer = await wb.xlsx.writeBuffer();
    return new StreamableFile(Buffer.from(new Uint8Array(buffer as unknown as ArrayBuffer)));
  }

  /** 解析 xlsx：读第一个 sheet → string[][]（与 parseCsv 输出一致：第一行=表头） */
  private async parseXlsxRows(buffer: Buffer): Promise<string[][]> {
    const wb = new ExcelJS.Workbook();
    // exceljs 自声明全局 Buffer（extends ArrayBuffer）与 Node Buffer 冲突——类型双转换，
    // 运行时传 Node Buffer（JSZip 需要），不能传 buffer.buffer（ArrayBuffer 会导致 iterable 错误）
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('XLSX file has no worksheet');
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row: ExcelJS.Row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
        cells.push(cell.text?.trim() ?? '');
      });
      rows.push(cells);
    });
    if (rows.length === 0) throw new BadRequestException('XLSX file is empty');
    return rows;
  }

  /**
   * 执行导入：按映射逐行构建实体数据 → 校验 → 创建。
   * 行级失败收集到 errors，全部成功 = COMPLETED，部分失败 = PARTIAL，全失败 = FAILED。
   */
  async run(workspaceId: string, jobId: string, mapping: Record<string, ColumnMapping>, defaults: Record<string, unknown>, userId: string) {
    const job = await this.get(workspaceId, jobId);
    if (job.status !== 'PREVIEW') {
      throw new BadRequestException('Import job already executed');
    }

    // 校验映射合法性
    const fieldAllowlist = ALLOWED_FIELDS[job.entityType as ImportEntityType];
    const resolved: Record<number, ColumnMapping> = {};
    for (const [idxStr, col] of Object.entries(mapping)) {
      const idx = Number(idxStr);
      if (!Number.isInteger(idx) || idx < 0 || idx >= job.columnHeaders.length) {
        throw new BadRequestException(`Invalid column index: ${idxStr}`);
      }
      if (!fieldAllowlist.includes(col.field)) {
        throw new BadRequestException(`Field "${col.field}" is not importable for ${job.entityType}`);
      }
      resolved[idx] = col;
    }
    if (!Object.values(resolved).some((c) => c.field === 'title')) {
      throw new BadRequestException('Mapping must include the "title" column');
    }

    await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING', mapping: mapping as any } });

    const rows = await this.readJobRows(jobId);
    const errors: { row: number; message: string }[] = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2; // 1-based 数据行（含表头偏移）
      try {
        const data = await this.buildEntityData(job.workspaceId, job.entityType as ImportEntityType, rows[i], resolved, defaults);
        await this.createEntity(job.workspaceId, job.entityType as ImportEntityType, data, userId);
        success++;
      } catch (err: any) {
        errors.push({ row: rowNo, message: err?.message ?? 'unknown error' });
      }
    }

    const status = errors.length === 0 ? 'COMPLETED' : success > 0 ? 'PARTIAL' : 'FAILED';
    const result = await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status, successCount: success, failCount: errors.length, errors: errors as any, completedAt: new Date() },
    });

    this.logger.log(`Import ${jobId}: ${success} ok / ${errors.length} failed (${status})`);
    await this.activitiesService.log(
      EntityType.IMPORT_JOB,
      jobId,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { status, successCount: success, failCount: errors.length } as any,
    );
    return { id: jobId, status, successCount: success, failCount: errors.length, errors };
  }

  /** 从 preview 还原全部数据行（按 columnHeaders 顺序取值——JSONB 存储会按 key 排序，不能依赖 Object.values 顺序） */
  private async readJobRows(jobId: string): Promise<string[][]> {
    const job = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      select: { preview: true, columnHeaders: true },
    });
    const headers = job?.columnHeaders ?? [];
    const preview = (job?.preview ?? []) as Record<string, unknown>[];
    return preview.map((row) =>
      headers.map((h) => {
        const v = row[h];
        return v === undefined || v === null ? '' : String(v);
      }),
    );
  }

  private async buildEntityData(
    workspaceId: string,
    entityType: ImportEntityType,
    row: string[],
    mapping: Record<number, ColumnMapping>,
    defaults: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = { ...defaults };

    for (const [idxStr, col] of Object.entries(mapping)) {
      const idx = Number(idxStr);
      let value = row[idx] ?? '';
      // 自定义 valueMap 优先，其次内置默认映射
      if (col.valueMap && col.valueMap[value] !== undefined) {
        value = col.valueMap[value];
      } else if (value) {
        value = mapValue(col.field, value);
      }
      if (value === '' || value === undefined) continue;
      if (col.field === 'tags') {
        data.tags = String(value).split(/[;|]/).map((s) => s.trim()).filter(Boolean);
      } else {
        data[col.field] = value;
      }
    }

    // 必填校验
    for (const f of REQUIRED_FIELDS[entityType]) {
      const v = data[f];
      if (v === undefined || String(v).trim() === '') {
        throw new Error(`Missing required field: ${f}`);
      }
    }

    // 枚举白名单校验（Jira 等外部值映射后必须落在允许集合内）
    const ENUM_ALLOW: Partial<Record<string, string[]>> = {
      SUPPORT: { type: ['SUPPORT_REQUEST', 'DEFECT'], status: ['OPEN', 'IN_REVIEW', 'CLOSED'] } as any,
      TEST_CASE: { type: ['FEATURE', 'PERFORMANCE', 'SECURITY', 'API'], priority: ['P0', 'P1', 'P2', 'P3'] } as any,
      IDEA: { status: ['OPEN', 'IN_REVIEW', 'PLANNED', 'SHIPPED', 'REJECTED', 'ALREADY_EXISTING', 'DUPLICATED', 'DRAFT'] } as any,
    }[entityType];
    if (ENUM_ALLOW) {
      for (const [field, allowed] of Object.entries(ENUM_ALLOW) as [string, string[]][]) {
        const v = data[field];
        if (v !== undefined && v !== null && String(v) !== '' && !allowed.includes(String(v))) {
          throw new Error(`Invalid ${field} value: ${v} (allowed: ${allowed.join(', ')})`);
        }
      }
    }

    // 引用字段解析
    if (data.assigneeEmail) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, user: { email: { equals: String(data.assigneeEmail), mode: 'insensitive' } } },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (!member) throw new Error(`Assignee not found in workspace: ${data.assigneeEmail}`);
      data.assigneeId = member.user.id;
      data.assigneeName = member.user.name || member.user.email;
      delete data.assigneeEmail;
    }
    if (data.releaseName) {
      const release = await this.prisma.release.findFirst({
        where: {
          workspaceId,
          OR: [{ name: { equals: String(data.releaseName), mode: 'insensitive' } }, { version: { equals: String(data.releaseName), mode: 'insensitive' } }],
        },
      });
      if (!release) throw new Error(`Release not found: ${data.releaseName}`);
      data.releaseId = release.id;
      delete data.releaseName;
    }
    if (data.storyCode) {
      const story = await this.prisma.story.findFirst({
        where: { workspaceId, code: { equals: String(data.storyCode), mode: 'insensitive' } },
      });
      if (!story) throw new Error(`Story not found by code: ${data.storyCode}`);
      data.storyId = story.id;
      delete data.storyCode;
    }

    return data;
  }

  private async createEntity(
    workspaceId: string,
    entityType: ImportEntityType,
    data: Record<string, unknown>,
    userId: string,
  ) {
    switch (entityType) {
      case 'IDEA':
        return withCodeRetry(this.prisma, workspaceId, 'IDEA', (code) =>
          this.prisma.idea.create({
            data: { workspaceId, code, title: String(data.title), description: (data.description as string) ?? undefined, category: (data.category as string) ?? undefined, status: (data.status as string) || 'OPEN', assigneeId: (data.assigneeId as string) ?? null, assigneeName: (data.assigneeName as string) ?? null, tags: (data.tags as string[]) ?? [], createdById: userId },
          }),
        );
      case 'SUPPORT':
        return withCodeRetry(this.prisma, workspaceId, 'SUPPORT', (code) =>
          this.prisma.support.create({
            data: { workspaceId, code, title: String(data.title), description: (data.description as string) ?? undefined, status: (data.status as string) || 'OPEN', type: (data.type as string) || 'SUPPORT_REQUEST', releaseId: (data.releaseId as string) ?? null, assigneeId: (data.assigneeId as string) ?? null, assigneeName: (data.assigneeName as string) ?? null, tags: (data.tags as string[]) ?? [], createdById: userId },
          }),
        );
      case 'TEST_CASE':
        return withCodeRetry(this.prisma, workspaceId, 'TEST_CASE', (code) =>
          this.prisma.testCase.create({
            data: { workspaceId, code, title: String(data.title), description: (data.description as string) ?? undefined, type: (data.type as string) || 'FEATURE', expectedResult: (data.expectedResult as string) ?? undefined, priority: (data.priority as string) || 'P2', storyId: (data.storyId as string) ?? null, releaseId: (data.releaseId as string) ?? null, createdById: userId },
          }),
        );
    }
  }
}
