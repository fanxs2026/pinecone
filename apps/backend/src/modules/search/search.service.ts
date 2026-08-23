import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /** 跨实体搜索（Cmd+K 全局搜索）：title/code/description 模糊匹配，按实体分组 */
  async globalSearch(workspaceId: string, q: string, opts: { userId: string; role: string }) {
    const term = q.trim();
    if (!term) return { query: term, results: [] };

    // 团队隔离（P0-④）：非管理员只看自己团队 + 未归属实体
    let teamFilter: { OR: Array<{ teamId: null } | { teamId: { in: string[] } }> } | undefined;
    if (opts.role !== 'ADMIN') {
      const tms = await this.prisma.teamMember.findMany({
        where: { team: { workspaceId }, userId: opts.userId },
        select: { teamId: true },
      });
      teamFilter = { OR: [{ teamId: null }, { teamId: { in: tms.map((t) => t.teamId) } }] };
    }

    const [stories, ideas, features, supports] = await Promise.all([
      this.prisma.story.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(teamFilter ? { AND: [teamFilter] } : {}),
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { code: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, code: true, title: true, status: true, parentId: true },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.idea.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(teamFilter ? { AND: [teamFilter] } : {}),
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { code: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, code: true, title: true, status: true },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.feature.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(teamFilter ? { AND: [teamFilter] } : {}),
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { code: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, code: true, title: true, status: true },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.support.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(teamFilter ? { AND: [teamFilter] } : {}),
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { code: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, code: true, title: true, status: true },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const results = [
      ...stories.map((s) => ({
        entityType: 'STORY',
        id: s.id,
        code: s.code,
        title: s.title,
        status: s.status,
        parentId: s.parentId,
      })),
      ...ideas.map((i) => ({ entityType: 'IDEA', id: i.id, code: i.code, title: i.title, status: i.status })),
      ...features.map((f) => ({ entityType: 'FEATURE', id: f.id, code: f.code, title: f.title, status: f.status })),
      ...supports.map((s) => ({ entityType: 'SUPPORT', id: s.id, code: s.code, title: s.title, status: s.status })),
    ];

    return { query: term, results };
  }
}
