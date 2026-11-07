import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityType } from '../../generated/enums';
import { Prisma, type CustomField } from '../../generated/client';
import {
  getCustomFieldLimit,
  isTypeChangeAllowed,
  normalizeCustomFields,
  parseOptions,
  type CustomFieldDef,
  type CustomFieldOption,
} from './custom-field-validation';
import type { EntityFilter } from './entity-filter';
import { CUSTOM_FIELD_ENTITY_TYPES, type CreateCustomFieldDto } from './dto/create-custom-field.dto';
import type { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import type { ReorderCustomFieldsDto } from './dto/reorder-custom-fields.dto';

const ENTITY_TYPE_LIST: string[] = [...CUSTOM_FIELD_ENTITY_TYPES];

/** 定义 → 校验器所需的最小视图 */
function toDef(row: CustomField): CustomFieldDef {
  return {
    key: row.key,
    label: row.label,
    type: row.type,
    options: row.options,
    isRequired: row.isRequired,
    isActive: row.isActive,
  };
}

/** 写 JSON 列：undefined 表示不写该列，null 表示置空（PostgreSQL NULL，非 JSON null） */
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

function assertEntityType(entityType: string): asserts entityType is (typeof CUSTOM_FIELD_ENTITY_TYPES)[number] {
  if (!ENTITY_TYPE_LIST.includes(entityType)) {
    throw new BadRequestException(`不支持的实体类型：${entityType}`);
  }
}

/**
 * 工作区自定义属性。
 *
 * 设计：定义落 custom_fields 表，值落各实体的 custom_fields JSONB 列。
 * 本服务同时承担「定义管理」与「值校验」两个职责，后者供四类实体的
 * service 在创建/更新时调用，保证校验口径只有一处。
 */
@Injectable()
export class CustomFieldsService {
  constructor(private prisma: PrismaService) {}

  /** 定义列表 + 配额（配额只统计启用中的字段，归档即释放） */
  async findAll(workspaceId: string, entityType: string, includeInactive = false) {
    assertEntityType(entityType);
    const type = entityType as EntityType;

    const [items, used] = await Promise.all([
      this.prisma.customField.findMany({
        where: {
          workspaceId,
          entityType: type,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.customField.count({
        where: { workspaceId, entityType: type, isActive: true },
      }),
    ]);

    return { items, quota: { used, limit: getCustomFieldLimit() } };
  }

  async create(workspaceId: string, dto: CreateCustomFieldDto) {
    assertEntityType(dto.entityType);
    const type = dto.entityType as EntityType;

    const limit = getCustomFieldLimit();
    const used = await this.prisma.customField.count({
      where: { workspaceId, entityType: type, isActive: true },
    });
    if (used >= limit) {
      throw new BadRequestException(
        `${dto.entityType} 自定义属性已达上限 ${limit} 个，请先归档不使用的字段`,
      );
    }

    const options = this.normalizeOptionsForType(dto.type, dto.options);

    try {
      return await this.prisma.customField.create({
        data: {
          workspaceId,
          entityType: type,
          key: dto.key,
          label: dto.label.trim(),
          type: dto.type,
          options: toJsonInput(options),
          isRequired: dto.isRequired ?? false,
          defaultValue: toJsonInput(dto.defaultValue),
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      this.rethrowUniqueKey(error, dto.key);
      throw error;
    }
  }

  async update(workspaceId: string, id: string, dto: UpdateCustomFieldDto) {
    const existing = await this.prisma.customField.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('自定义属性不存在');

    if (dto.type && !isTypeChangeAllowed(existing.type, dto.type)) {
      throw new BadRequestException(
        `字段类型不能从 ${existing.type} 变更为 ${dto.type}，已有数据无法转换，请新建字段替代`,
      );
    }

    // 归档 → 启用 需要重新占用配额
    if (dto.isActive === true && !existing.isActive) {
      const limit = getCustomFieldLimit();
      const used = await this.prisma.customField.count({
        where: { workspaceId, entityType: existing.entityType, isActive: true },
      });
      if (used >= limit) {
        throw new BadRequestException(
          `${existing.entityType} 自定义属性已达上限 ${limit} 个，请先归档不使用的字段`,
        );
      }
    }

    const nextType = dto.type ?? existing.type;
    const options =
      dto.options !== undefined
        ? this.normalizeOptionsForType(nextType, dto.options)
        : this.normalizeOptionsForType(nextType, existing.options);

    return this.prisma.customField.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        options: toJsonInput(options),
        ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
        ...(dto.defaultValue !== undefined ? { defaultValue: toJsonInput(dto.defaultValue) } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * 删除定义，并从对应实体的 JSONB 列中剔除该 key。
   * 只清理本条定义所属实体类型的表，四个分支各自硬编码表名，避免动态拼接。
   */
  async remove(workspaceId: string, id: string) {
    const existing = await this.prisma.customField.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('自定义属性不存在');

    const key = existing.key;

    await this.prisma.$transaction(async (tx) => {
      switch (existing.entityType) {
        case EntityType.IDEA:
          await tx.$executeRaw`
            UPDATE "ideas" SET "custom_fields" = "custom_fields" - ${key}::text
            WHERE "workspaceId" = ${workspaceId}::uuid AND "custom_fields" IS NOT NULL`;
          break;
        case EntityType.FEATURE:
          await tx.$executeRaw`
            UPDATE "features" SET "custom_fields" = "custom_fields" - ${key}::text
            WHERE "workspaceId" = ${workspaceId}::uuid AND "custom_fields" IS NOT NULL`;
          break;
        case EntityType.STORY:
          await tx.$executeRaw`
            UPDATE "stories" SET "custom_fields" = "custom_fields" - ${key}::text
            WHERE "workspaceId" = ${workspaceId}::uuid AND "custom_fields" IS NOT NULL`;
          break;
        case EntityType.SUPPORT:
          await tx.$executeRaw`
            UPDATE "supports" SET "custom_fields" = "custom_fields" - ${key}::text
            WHERE "workspaceId" = ${workspaceId}::uuid AND "custom_fields" IS NOT NULL`;
          break;
        default:
          // TEST_CASE / IMPORT_JOB 不在自定义属性支持范围内，无值列可清理
          break;
      }
      await tx.customField.delete({ where: { id } });
    });

    return { id, key, entityType: existing.entityType };
  }

  /** 批量排序：只接受属于本工作区的 id，多余 id 直接忽略 */
  async reorder(workspaceId: string, dto: ReorderCustomFieldsDto) {
    const ids = dto.items.map((i) => i.id);
    const owned = await this.prisma.customField.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));

    await this.prisma.$transaction(
      dto.items
        .filter((i) => ownedIds.has(i.id))
        .map((i) =>
          this.prisma.customField.update({
            where: { id: i.id },
            data: { sortOrder: i.sortOrder },
          }),
        ),
    );

    return { updated: ownedIds.size };
  }

  /**
   * 把列表筛选条件翻译成 Prisma where 片段。
   *
   * 只有单选类型参与筛选：它的取值来自固定选项集合，天然适合多选过滤；
   * 文本/数字/日期做精确匹配意义有限，多选的数组包含查询需要 JSONB 路径运算符，
   * 当前 ORM 层表达不了，统一留到后续版本，避免给出「能筛但筛不准」的能力。
   */
  async buildFilterConditions(
    workspaceId: string,
    entityType: string,
    filter: EntityFilter | null,
  ): Promise<Record<string, unknown>[]> {
    if (!filter) return [];
    const and: Record<string, unknown>[] = [];

    if (filter.status?.length) and.push({ status: { in: filter.status } });
    if (filter.priority?.length) and.push({ priority: { in: filter.priority } });

    if (filter.assigneeId?.length) {
      const ids = filter.assigneeId.filter((v) => v !== 'unassigned');
      const wantUnassigned = filter.assigneeId.includes('unassigned');
      const ors: Record<string, unknown>[] = [];
      if (ids.length > 0) ors.push({ assigneeId: { in: ids } });
      if (wantUnassigned) ors.push({ assigneeId: null });
      if (ors.length === 1) and.push(ors[0]);
      else if (ors.length > 1) and.push({ OR: ors });
    }

    if (filter.customFields) {
      const defs = await this.getActiveDefs(workspaceId, entityType);
      for (const [key, values] of Object.entries(filter.customFields)) {
        const def = defs.find((d) => d.key === key);
        if (!def || def.type !== 'SELECT') continue;
        const allowed = parseOptions(def.options).map((o) => o.value);
        const picked = values
          .map((v) => String(v))
          .filter((v) => allowed.includes(v));
        if (picked.length === 0) continue;
        and.push({
          OR: picked.map((value) => ({ customFields: { path: [key], equals: value } })),
        });
      }
    }

    return and;
  }

  /** 取该实体类型启用中的定义（供实体 service 做值校验） */
  async getActiveDefs(workspaceId: string, entityType: string): Promise<CustomFieldDef[]> {
    assertEntityType(entityType);
    const rows = await this.prisma.customField.findMany({
      where: { workspaceId, entityType: entityType as EntityType, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDef);
  }

  /**
   * 归一并校验实体提交的 customFields。
   *
   * - 入参为 undefined 且非必填场景：返回 undefined，表示「本次未提交该字段」，调用方应跳过写入。
   * - 校验失败抛出 400，message 为数组（与全局 ValidationPipe 风格一致）。
   */
  async normalize(
    workspaceId: string,
    entityType: string,
    input: Record<string, unknown> | null | undefined,
    opts: { requireAll: boolean },
  ): Promise<Record<string, unknown> | undefined> {
    if (input === undefined) return undefined;
    const defs = await this.getActiveDefs(workspaceId, entityType);
    const { value, errors } = normalizeCustomFields(defs, input, opts);
    if (errors.length > 0) throw new BadRequestException(errors);
    return value;
  }

  /** SELECT / MULTI_SELECT 必须有非空且唯一的选项；其他类型忽略 options */
  private normalizeOptionsForType(type: string, raw: unknown): CustomFieldOption[] | null {
    if (type !== 'SELECT' && type !== 'MULTI_SELECT') return null;

    const options = parseOptions(raw);
    if (options.length === 0) {
      throw new BadRequestException('单选/多选类型必须提供至少一个选项');
    }
    const seen = new Set<string>();
    for (const opt of options) {
      if (seen.has(opt.value)) {
        throw new BadRequestException(`选项值重复：${opt.value}`);
      }
      seen.add(opt.value);
    }
    return options;
  }

  /** Prisma 唯一约束冲突 → 可读错误 */
  private rethrowUniqueKey(error: unknown, key: string): void {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === 'P2002') {
      throw new BadRequestException(`字段标识「${key}」已存在，请换一个`);
    }
  }
}
