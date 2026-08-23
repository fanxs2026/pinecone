import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { LinkEntityDto, CreatePageFromEntityDto } from './dto/kb-link.dto';
import { Prisma } from '../../generated/client';
import type { PaginatedResult } from '../../common/dto/pagination.dto';
import { slugify } from '../../common/utils/slugify';

const userSelect = { select: { id: true, email: true, name: true } };

// SECURITY/STORAGE: page content is a Tiptap JSON stored as a DB row; inline
// base64 images inflate it quickly. Reject oversized payloads at the API edge.
const PAGE_CONTENT_MAX_BYTES = 512 * 1024; // 512KB serialized JSON

function assertPageContentSize(content: unknown) {
  if (content === undefined || content === null) return;
  const size = Buffer.byteLength(JSON.stringify(content), 'utf8');
  if (size > PAGE_CONTENT_MAX_BYTES) {
    throw new BadRequestException(
      `Page content exceeds ${PAGE_CONTENT_MAX_BYTES} bytes (inline images inflate storage; use attachment upload)`,
    );
  }
}

@Injectable()
export class KnowledgeBaseService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // Spaces
  // ============================================================

  async listSpaces(workspaceId: string, skip = 0, take = 50): Promise<PaginatedResult<any>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.kbSpace.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { pages: true } } },
        skip,
        take,
      }),
      this.prisma.kbSpace.count({ where: { workspaceId, deletedAt: null } }),
    ]);
    return { items, total, skip, take };
  }

  async getSpace(workspaceId: string, id: string) {
    const space = await this.prisma.kbSpace.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!space) throw new NotFoundException('Space not found');
    return space;
  }

  async createSpace(workspaceId: string, dto: CreateSpaceDto, userId: string) {
    const slug = dto.slug || slugify(dto.name);

    try {
      return await this.prisma.kbSpace.create({
        data: { workspaceId, name: dto.name, slug, icon: dto.icon, description: dto.description },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`Space slug "${slug}" already exists`);
      }
      throw err;
    }
  }

  async updateSpace(workspaceId: string, id: string, dto: UpdateSpaceDto) {
    const space = await this.getSpace(workspaceId, id);
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.visibility !== undefined) updateData.visibility = dto.visibility;
    return this.prisma.kbSpace.update({
      where: { id: space.id },
      data: updateData,
    });
  }

  async deleteSpace(workspaceId: string, id: string) {
    const space = await this.getSpace(workspaceId, id);
    return this.prisma.kbSpace.update({
      where: { id: space.id },
      data: { deletedAt: new Date() },
    });
  }

  // ============================================================
  // Pages
  // ============================================================

  // F-01(复测) 修复：tx 可选参数——事务内调用时用事务客户端，保证读一致
  private async buildPath(
    workspaceId: string,
    parentId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    if (!parentId) return '/';
    const client = tx ?? this.prisma;
    const parent = await client.kbPage.findFirst({
      where: { id: parentId, workspaceId, deletedAt: null },
      select: { path: true, id: true },
    });
    if (!parent) throw new NotFoundException('Parent page not found');
    return `${parent.path || '/'}${parent.id}/`;
  }

  /**
   * 防循环引用校验：新父级不能是页面自身或其子孙（否则父子互指导致页面树损坏）。
   * - parentId 为空（移到根级）天然安全，直接返回
   * - 从该页出发沿 parentId 链向上走，若到达 parentId 说明父级是自身后代 → 400
   */
  private async assertSafeParent(
    workspaceId: string,
    pageId: string,
    parentId?: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    if (!parentId) return;
    if (parentId === pageId) {
      throw new BadRequestException('Cannot move a page under itself');
    }
    const client = tx ?? this.prisma;
    // 沿父链向上追溯：收集所有祖先，若出现 parentId 则构成循环
    const ancestors = new Set<string>();
    let current: string | null = parentId;
    while (current) {
      if (current === pageId) {
        throw new BadRequestException('Cannot move a page under its own descendant');
      }
      if (ancestors.has(current)) break; // 已有环（防御）
      ancestors.add(current);
      const row: { parentId: string | null } | null = await client.kbPage.findFirst({
        where: { id: current, workspaceId, deletedAt: null },
        select: { parentId: true },
      });
      if (!row) break; // 父级不存在/悬空，由 buildPath 抛 NotFound
      current = row.parentId;
    }
  }

  async listPages(workspaceId: string, spaceId?: string, parentId?: string, skip = 0, take = 50, role?: string): Promise<PaginatedResult<any>> {
    const where: Prisma.KbPageWhereInput = {
      workspaceId,
      deletedAt: null,
    };
    if (spaceId !== undefined) where.spaceId = spaceId || null;
    if (parentId !== undefined) where.parentId = parentId || null;
    // G1 知识库 P1-B：PRIVATE 页面仅白名单角色可见（列表过滤）
    if (role) {
      where.OR = [
        { visibility: { not: 'PRIVATE' } },
        { allowedRoleIds: { has: role } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.kbPage.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        include: {
          author: userSelect,
          updater: userSelect,
          tags: { include: { tag: true } },
          _count: { select: { children: true, comments: true } },
        },
        skip,
        take,
      }),
      this.prisma.kbPage.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  async listAllPagesInSpace(workspaceId: string, spaceId: string, skip = 0, take = 50, role?: string) {
    return this.prisma.kbPage.findMany({
      where: {
        workspaceId, spaceId, deletedAt: null,
        ...(role
          ? { OR: [{ visibility: { not: 'PRIVATE' } }, { allowedRoleIds: { has: role } }] }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      skip,
      take,
      select: {
        id: true, title: true, slug: true, parentId: true, path: true,
        sortOrder: true, status: true, spaceId: true,
        _count: { select: { children: true } },
      },
    });
  }

  async getPage(workspaceId: string, id: string, role?: string) {
    const page = await this.prisma.kbPage.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        space: true,
        author: userSelect,
        updater: userSelect,
        tags: { include: { tag: true } },
        _count: { select: { children: true, comments: true } },
      },
    });
    if (!page) throw new NotFoundException('Page not found');
    // G1 知识库 P1-B：PRIVATE 页面按角色白名单过滤（controller 传入当前用户角色）
    this.assertPageVisible(page, role);
    return page;
  }

  /** G1 知识库 P1-B：PRIVATE 页面仅 allowedRoleIds 命中角色可见（未传 role=内部调用，跳过） */
  private assertPageVisible(page: { visibility?: string | null; allowedRoleIds?: string[] }, role?: string) {
    if (!role) return;
    if (page.visibility === 'PRIVATE' && !(page.allowedRoleIds ?? []).includes(role)) {
      throw new NotFoundException('Page not found');
    }
  }

  /** searchVector 维护（P2-B）：写入时同步 tsvector，用 simple 分词（中英文按标点/空白切分，中文整串可搜） */
  private async syncSearchVector(tx: Prisma.TransactionClient, pageId: string, contentText: string | null | undefined) {
    await tx.$executeRaw`UPDATE "kb_pages" SET "searchVector" = to_tsvector('simple', coalesce(${contentText ?? ''}, '')) WHERE "id" = ${pageId}`;
  }

  async createPage(workspaceId: string, dto: CreatePageDto, userId: string) {
    const slug = dto.slug || slugify(dto.title);
    const path = await this.buildPath(workspaceId, dto.parentId);
    assertPageContentSize(dto.content);

    // SECURITY: space must belong to the current workspace
    if (dto.spaceId) {
      const space = await this.prisma.kbSpace.findFirst({
        where: { id: dto.spaceId, workspaceId },
        select: { id: true },
      });
      if (!space) throw new NotFoundException('Space not found');
    }

    try {
      const created = await this.prisma.kbPage.create({
        data: {
          workspaceId,
          spaceId: dto.spaceId || null,
          parentId: dto.parentId || null,
          path,
          title: dto.title,
          slug,
          content: dto.content || undefined,
          contentText: dto.contentText || undefined,
          status: dto.status || 'draft',
          visibility: dto.visibility || 'SPACE',
          allowedRoleIds: dto.allowedRoleIds ?? [],
          authorId: userId,
        },
        include: { author: userSelect, tags: { include: { tag: true } } },
      });
      // P2-B：创建后同步 searchVector
      await this.syncSearchVector(this.prisma, created.id, created.contentText);
      return created;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`Page slug "${slug}" already exists in this space`);
      }
      throw err;
    }
  }

  async updatePage(workspaceId: string, id: string, dto: UpdatePageDto, userId: string, role?: string) {
    const page = await this.getPage(workspaceId, id);
    // G1 知识库 P1-B：PRIVATE 页面编辑同样受角色白名单约束
    this.assertPageVisible(page, role ?? 'ADMIN');

    const data: Prisma.KbPageUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.content !== undefined) {
      assertPageContentSize(dto.content);
      data.content = dto.content;
    }
    if (dto.contentText !== undefined) data.contentText = dto.contentText;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    if (dto.allowedRoleIds !== undefined) data.allowedRoleIds = dto.allowedRoleIds;
    data.updaterId = userId;
    data.version = page.version + 1;

    // G1 知识库 P2-A：内容变化时快照旧版本（diff 预览 + 回滚数据源）
    const snapshotVersion = page.version;

    // Handle space change（P2-13：跨 space 时新父级必须属于新 space）
    if (dto.spaceId !== undefined && dto.spaceId !== page.spaceId) {
      if (dto.spaceId && dto.spaceId !== page.spaceId) {
        await this.getSpace(workspaceId, dto.spaceId);
        if (dto.parentId) {
          const parent = await this.prisma.kbPage.findFirst({
            where: { id: dto.parentId, workspaceId, deletedAt: null },
            select: { spaceId: true },
          });
          if (!parent || parent.spaceId !== dto.spaceId) {
            throw new BadRequestException('Parent page must be in the same space');
          }
        }
      }
      data.spaceId = dto.spaceId;
    }

    // P2-12 修复：级联 path 更新 + 页面更新包进同一事务（原子，防半更新）
    return this.prisma.$transaction(async (tx) => {
      if (dto.parentId !== undefined && dto.parentId !== page.parentId) {
        // 防循环引用：新父级不能是自身或其子孙（事务内用 tx 保证读一致）
        await this.assertSafeParent(workspaceId, page.id, dto.parentId, tx);
        const oldPath = page.path ? `${page.path}${page.id}/` : `/${page.id}/`;
        data.parentId = dto.parentId || null;
        data.path = await this.buildPath(workspaceId, dto.parentId, tx);

        // Cascade path update to all sub-pages via raw SQL (Prisma can't do string replace on fields)
        // 注：$executeRawUnsafe 但全部使用 $1..$N 参数绑定（无字符串拼接），无 SQL 注入风险
        const newPath = data.path;
        await tx.$executeRawUnsafe(
          `UPDATE "kb_pages" SET "path" = REPLACE("path", $1, $2) WHERE "workspaceId" = $3 AND "path" LIKE $4`,
          oldPath, newPath, workspaceId, `${oldPath}%`,
        );
      }

      const updated = await tx.kbPage.update({
        where: { id: page.id },
        data,
        include: { author: userSelect, updater: userSelect, tags: { include: { tag: true } } },
      });

      // P2-A：内容或标题变化 → 写版本快照（仅内容相关变更）
      if (dto.content !== undefined || dto.contentText !== undefined) {
        await tx.kbPageVersion.create({
          data: {
            pageId: page.id,
            version: snapshotVersion,
            contentSnapshot: page.content as object | undefined,
            editorId: userId,
          },
        });
      }
      // P2-B：同步 searchVector（事务内）
      if (dto.contentText !== undefined) {
        await this.syncSearchVector(tx, page.id, dto.contentText);
      }
      return updated;
    });
  }

  async deletePage(workspaceId: string, id: string, role?: string) {
    const page = await this.getPage(workspaceId, id);
    this.assertPageVisible(page, role ?? 'ADMIN');
    const currentPath = page.path ? `${page.path}${page.id}/` : `/${page.id}/`;
    // Soft-delete page and all children
    await this.prisma.kbPage.updateMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          { id: page.id },
          { path: { startsWith: currentPath } },
        ],
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  // ============================================================
  // Comments
  // ============================================================

  async listComments(workspaceId: string, pageId: string, skip = 0, take = 50): Promise<PaginatedResult<any>> {
    const where = { workspaceId, pageId, deletedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.kbComment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: { author: userSelect },
        skip,
        take,
      }),
      this.prisma.kbComment.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  async createComment(workspaceId: string, dto: CreateCommentDto, userId: string) {
    // Validate page exists
    await this.getPage(workspaceId, dto.pageId);

    if (dto.parentId) {
      const parent = await this.prisma.kbComment.findFirst({
        where: { id: dto.parentId, workspaceId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
    }

    return this.prisma.kbComment.create({
      data: {
        workspaceId,
        pageId: dto.pageId,
        parentId: dto.parentId || null,
        authorId: userId,
        body: dto.body,
      },
      include: { author: userSelect },
    });
  }

  async deleteComment(workspaceId: string, id: string, userId: string) {
    const comment = await this.prisma.kbComment.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenException('Cannot delete another user\'s comment');

    return this.prisma.kbComment.update({
      where: { id: comment.id },
      data: { deletedAt: new Date() },
    });
  }

  // ============================================================
  // Tags
  // ============================================================

  async listTags(workspaceId: string) {
    const tags = await this.prisma.kbTag.findMany({
      where: { workspaceId },
    });

    // Count only pages that are NOT soft-deleted
    const counts = await this.prisma.$queryRawUnsafe<{ tagId: string; count: bigint }[]>(
      `SELECT kpt."tagId" as "tagId", COUNT(*) as count
       FROM "kb_page_tags" kpt
       JOIN "kb_pages" p ON p.id = kpt."pageId" AND p."deletedAt" IS NULL
       WHERE kpt."tagId" = ANY($1)
       GROUP BY kpt."tagId"`,
      tags.map((t) => t.id),
    );

    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(row.tagId, Number(row.count));
    }

    return tags.map((tag) => ({
      ...tag,
      _count: { pages: countMap.get(tag.id) || 0 },
    }));
  }

  async upsertTag(workspaceId: string, name: string, color?: string) {
    const slug = slugify(name);
    return this.prisma.kbTag.upsert({
      where: { workspaceId_slug: { workspaceId, slug } },
      create: { workspaceId, name, slug, color },
      update: { name, color },
    });
  }

  async addTagToPage(workspaceId: string, pageId: string, tagId: string) {
    await this.getPage(workspaceId, pageId);
    // SECURITY: tag must belong to the current workspace
    const tag = await this.prisma.kbTag.findFirst({
      where: { id: tagId, workspaceId },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    return this.prisma.kbPageTag.upsert({
      where: { pageId_tagId: { pageId, tagId } },
      create: { pageId, tagId },
      update: {},
    });
  }

  async removeTagFromPage(workspaceId: string, pageId: string, tagId: string) {
    await this.getPage(workspaceId, pageId);
    await this.prisma.kbPageTag.deleteMany({ where: { pageId, tagId } });
  }

  // ============================================================
  // Templates
  // ============================================================

  async getTemplates(workspaceId: string) {
    return this.prisma.kbPage.findMany({
      where: { workspaceId, status: 'template', deletedAt: null },
      include: { tags: { include: { tag: true } } },
    });
  }

  async createFromTemplate(workspaceId: string, templateId: string, dto: CreatePageDto, userId: string) {
    const template = await this.getPage(workspaceId, templateId);
    return this.createPage(workspaceId, {
      ...dto,
      content: template.content,
      contentText: template.contentText ?? undefined,
    }, userId);
  }

  // ============================================================
  // Search
  // ============================================================

  // G1 知识库 P2-B：全文检索走 searchVector 列（GIN 索引）+ 标题前缀兜底；PRIVATE 页面按角色白名单过滤
  async search(workspaceId: string, query: string, role?: string) {
    if (!query.trim()) return [];
    const q = `%${query}%`;
    // K 修复（2026-08-19）：$queryRawUnsafe → Prisma.sql 参数化；roleClause 动态拼接，占位符与实际参数一致
    const roleClause = role
      ? Prisma.sql`AND ("visibility" <> 'PRIVATE' OR "allowedRoleIds" @> ARRAY[${role}]::text[])`
      : Prisma.sql`AND "visibility" <> 'PRIVATE'`;
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, title, slug, "spaceId", "parentId", status, "contentText",
             ts_rank("searchVector", plainto_tsquery('simple', ${query})) as rank
      FROM "kb_pages"
      WHERE "workspaceId" = ${workspaceId} AND "deletedAt" IS NULL
        AND ("searchVector" @@ plainto_tsquery('simple', ${query}) OR title ILIKE ${q})
        ${roleClause}
      ORDER BY
        CASE WHEN title ILIKE ${`${query}%`} THEN 0 ELSE 1 END,
        rank DESC,
        "updatedAt" DESC
      LIMIT 20
    `);
  }

  // ============================================================
  // Move / Reorder
  // ============================================================

  async movePage(workspaceId: string, id: string, dto: { parentId?: string | null; sortOrder?: number }) {
    const page = await this.getPage(workspaceId, id);
    const data: any = {};
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    // P2-12/13 修复：级联 path + 页面更新原子事务；新父级必须与页面同 space
    return this.prisma.$transaction(async (tx) => {
      if (dto.parentId !== undefined && dto.parentId !== page.parentId) {
        // 防循环引用：新父级不能是自身或其子孙（事务内用 tx 保证读一致）
        await this.assertSafeParent(workspaceId, page.id, dto.parentId, tx);
        // P2-13：新父级必须与页面同 space（防止跨 space 移动产生悬空父级）
        if (dto.parentId) {
          const parent = await tx.kbPage.findFirst({
            where: { id: dto.parentId, workspaceId, deletedAt: null },
            select: { spaceId: true },
          });
          if (!parent || parent.spaceId !== page.spaceId) {
            throw new BadRequestException('Parent page must be in the same space');
          }
        }
        // Same cascade logic as updatePage: rebuild this page's path and
        // propagate the change to all descendants, otherwise stale paths break
        // cascading soft-deletes and the path chain.
        const oldPath = page.path ? `${page.path}${page.id}/` : `/${page.id}/`;
        data.parentId = dto.parentId;
        data.path = await this.buildPath(workspaceId, dto.parentId || undefined, tx);
        // 注：$executeRawUnsafe 但全部参数绑定（$1..$N），无注入风险
        await tx.$executeRawUnsafe(
          `UPDATE "kb_pages" SET "path" = REPLACE("path", $1, $2) WHERE "workspaceId" = $3 AND "path" LIKE $4`,
          oldPath, data.path, workspaceId, `${oldPath}%`,
        );
      }
      return tx.kbPage.update({
        where: { id: page.id },
        data,
        select: { id: true, title: true, slug: true, parentId: true, path: true, sortOrder: true },
      });
    });
  }

  // ============================================================
  // Export
  // ============================================================

  async exportPage(workspaceId: string, id: string, format: string) {
    const page = await this.getPage(workspaceId, id);
    if (format === 'markdown') {
      const lines: string[] = [];
      lines.push(`# ${page.title}`);
      lines.push('');
      lines.push(`> 版本 ${page.version} · ${new Date(page.updatedAt).toLocaleDateString('zh-CN')}`);
      lines.push('');
      if (page.contentText) {
        lines.push(page.contentText);
      }
      return { filename: `${page.slug || page.id}.md`, content: lines.join('\n') };
    }
    if (format === 'text') {
      return { filename: `${page.slug || page.id}.txt`, content: `# ${page.title}\n\n${page.contentText || ''}` };
    }
    return page;
  }

  // ============================================================
  // G1 知识库 P1-A：KbPage ↔ 研发工作项双向关联
  // ============================================================

  /** 实体类型 → Prisma 模型映射（标题解析用） */
  private readonly ENTITY_MODEL: Record<string, string> = {
    IDEA: 'idea',
    FEATURE: 'feature',
    STORY: 'story',
    SUPPORT: 'support',
    RELEASE: 'release',
    TEST_CASE: 'testCase',
  };

  private async entityTitle(entityType: string, entityId: string): Promise<string | null> {
    const model = this.ENTITY_MODEL[entityType];
    if (!model) return null;
    // 不 select 固定字段：不同实体字段集不同（Story 无 name，Release 无 title），全字段返回再取
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: { title?: string; name?: string; code?: string } | null = await (this.prisma as any)[model]
      .findUnique({ where: { id: entityId } })
      .catch(() => null);
    if (!row) return null;
    return row.title || row.name || row.code || null;
  }

  /** 页面关联列表（含实体标题，供卡片展示） */
  async listPageLinks(workspaceId: string, pageId: string) {
    const page = await this.getPage(workspaceId, pageId);
    const links = await this.prisma.kbPageLink.findMany({
      where: { workspaceId, pageId: page.id },
      orderBy: { createdAt: 'asc' },
    });
    const resolved = await Promise.all(
      links.map(async (l) => ({ ...l, entityTitle: await this.entityTitle(l.entityType, l.entityId) })),
    );
    return resolved;
  }

  /** 添加关联（页面 ← 实体） */
  async linkEntityToPage(workspaceId: string, pageId: string, dto: LinkEntityDto, userId: string) {
    const page = await this.getPage(workspaceId, pageId);
    // SECURITY: 关联的实体必须属于当前工作区
    const model = this.ENTITY_MODEL[dto.entityType];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = await (this.prisma as any)[model]
      .findFirst({ where: { id: dto.entityId, workspaceId }, select: { id: true } })
      .catch(() => null);
    if (!entity) throw new NotFoundException('Entity not found in this workspace');
    return this.prisma.kbPageLink.create({
      data: {
        workspaceId,
        pageId: page.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        linkType: dto.linkType ?? 'REFERENCE',
        createdById: userId,
      },
    });
  }

  /** 移除关联 */
  async removePageLink(workspaceId: string, pageId: string, linkId: string) {
    const link = await this.prisma.kbPageLink.findFirst({ where: { id: linkId, workspaceId, pageId } });
    if (!link) throw new NotFoundException('Link not found');
    await this.prisma.kbPageLink.delete({ where: { id: linkId } });
    return { ok: true };
  }

  /** 反向查询：实体详情页的「相关知识」（KbPageLink where entityId） */
  async listEntityPages(workspaceId: string, entityType: string, entityId: string) {
    return this.prisma.kbPageLink.findMany({
      where: { workspaceId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { page: { select: { id: true, title: true, slug: true, status: true, spaceId: true, updatedAt: true } } },
    });
  }

  /** 实体搜索（关联选择器用）：按各实体实际存在的标题/编码字段模糊匹配 */
  async searchEntities(workspaceId: string, entityType: string, q?: string) {
    const model = this.ENTITY_MODEL[entityType];
    if (!model) throw new BadRequestException('Unsupported entity type: ' + entityType);
    // 各实体字段集不同（Release 无 title，Story/Support 无 name）——只 OR 确定存在的字段，避免 Prisma 运行时字段校验报错
    const searchFields = this.ENTITY_SEARCH_FIELDS[entityType] ?? ['title', 'code'];
    const kw = q?.trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { workspaceId, deletedAt: null };
    if (kw) {
      where.OR = searchFields.map((f) => ({ [f]: { contains: kw, mode: 'insensitive' } }));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.prisma as any)[model]
      .findMany({ where, take: 10, orderBy: { createdAt: 'desc' } })
      .catch(() => []);
    return rows.map((r: any) => ({
      id: r.id,
      title: r.title || r.name || r.code || '',
      code: r.code ?? null,
      status: r.status ?? null,
    }));
  }

  /** 实体标题字段映射（搜索白名单，防不存在字段） */
  private readonly ENTITY_SEARCH_FIELDS: Record<string, string[]> = {
    IDEA: ['title'],
    FEATURE: ['title'],
    STORY: ['title', 'code'],
    SUPPORT: ['title', 'code'],
    RELEASE: ['name', 'code'],
    TEST_CASE: ['title', 'code'],
  };

  /** 从研发工作项一键沉淀知识库页面（标题=实体标题，正文=实体信息，linkType=GENERATED_FROM） */
  async createPageFromEntity(workspaceId: string, dto: CreatePageFromEntityDto, userId: string) {
    const model = this.ENTITY_MODEL[dto.entityType];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = await (this.prisma as any)[model]
      .findFirst({
        where: { id: dto.entityId, workspaceId, deletedAt: null },
      })
      .catch(() => null);
    if (!entity) throw new NotFoundException('Entity not found');
    const title = (entity.title || entity.name || entity.code || '未命名') + '（' + dto.entityType + '）';
    const desc = entity.description ? String(entity.description).slice(0, 500) : '（由研发工作项自动沉淀，无描述）';
    const meta = '实体: ' + dto.entityType + ' · ' + (entity.code ?? '-') + ' · 状态: ' + (entity.status ?? '-') + ' · 负责人: ' + (entity.assigneeName ?? '-');
    // Tiptap JSON：元信息 + 描述
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: meta }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: desc }] },
      ],
    };
    const page = await this.createPage(
      workspaceId,
      { title, content, contentText: title + '\n' + meta + '\n' + desc, spaceId: dto.spaceId },
      userId,
    );
    // 沉淀页自动关联回实体（GENERATED_FROM）
    await this.prisma.kbPageLink
      .create({
        data: {
          workspaceId,
          pageId: page.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          linkType: 'GENERATED_FROM',
          createdById: userId,
        },
      })
      .catch(() => null); // 重复关联容忍
    return page;
  }

  // ============================================================
  // G1 知识库 P2-A：版本历史 / 回滚
  // ============================================================

  /** 版本列表（含编辑者） */
  async listPageVersions(workspaceId: string, pageId: string) {
    const page = await this.getPage(workspaceId, pageId);
    return this.prisma.kbPageVersion.findMany({
      where: { pageId: page.id },
      orderBy: { version: 'desc' },
      include: { editor: { select: { id: true, email: true, name: true } } },
    });
  }

  /** 回滚到指定版本：写回 content，版本号+1，并留当前快照 */
  async rollbackPage(workspaceId: string, pageId: string, version: number, userId: string, role?: string) {
    const page = await this.getPage(workspaceId, pageId, role);
    const snap = await this.prisma.kbPageVersion.findFirst({ where: { pageId: page.id, version } });
    if (!snap) throw new NotFoundException('Version not found');
    return this.prisma.$transaction(async (tx) => {
      const next = page.version + 1;
      const result = await tx.kbPage.update({
        where: { id: page.id },
        data: { content: (snap.contentSnapshot as object) ?? null, updaterId: userId, version: next },
        include: { author: userSelect, updater: userSelect, tags: { include: { tag: true } } },
      });
      // 回滚前快照当前版本
      await tx.kbPageVersion.create({
        data: {
          pageId: page.id,
          version: page.version,
          contentSnapshot: page.content as object | undefined,
          editorId: userId,
        },
      });
      return result;
    });
  }
}
