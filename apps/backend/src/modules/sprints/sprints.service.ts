import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Sprint 迭代服务（P1-①：迭代规划 + Backlog） */
@Injectable()
export class SprintsService {
  constructor(private prisma: PrismaService) {}

  async list(workspaceId: string, releaseId?: string) {
    const where: any = { workspaceId };
    if (releaseId) where.releaseId = releaseId;
    const sprints = await this.prisma.sprint.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { stories: true } },
      },
    });
    // 容量统计（storyPoints 求和 + 完成点数）
    return Promise.all(
      sprints.map(async (sp) => {
        const agg = await this.prisma.story.aggregate({
          where: { sprintId: sp.id, deletedAt: null },
          _sum: { storyPoints: true },
          _count: { _all: true },
        });
        const done = await this.prisma.story.count({
          where: { sprintId: sp.id, deletedAt: null, status: 'DONE' },
        });
        return {
          id: sp.id,
          releaseId: sp.releaseId,
          name: sp.name,
          startDate: sp.startDate,
          endDate: sp.endDate,
          goal: sp.goal,
          status: sp.status,
          sortOrder: sp.sortOrder,
          totalPoints: agg._sum.storyPoints ?? 0,
          storyCount: agg._count._all,
          doneCount: done,
        };
      }),
    );
  }

  async getStats(workspaceId: string, id: string) {
    const sprint = await this.getSprint(workspaceId, id);
    const [total, done, inProgress] = await Promise.all([
      this.prisma.story.aggregate({
        where: { sprintId: sprint.id, deletedAt: null },
        _sum: { storyPoints: true },
        _count: { _all: true },
      }),
      this.prisma.story.count({ where: { sprintId: sprint.id, deletedAt: null, status: 'DONE' } }),
      this.prisma.story.count({ where: { sprintId: sprint.id, deletedAt: null, status: 'IN_PROGRESS' } }),
    ]);
    return {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      totalPoints: total._sum.storyPoints ?? 0,
      storyCount: total._count._all,
      doneCount: done,
      inProgressCount: inProgress,
      progress: total._count._all > 0 ? Math.round((done / total._count._all) * 100) : 0,
    };
  }

  async create(
    workspaceId: string,
    dto: { name: string; releaseId?: string; startDate?: string; endDate?: string; goal?: string; status?: string },
  ) {
    if (!dto.name?.trim()) throw new BadRequestException('迭代名称不能为空');
    if (dto.releaseId) {
      const release = await this.prisma.release.findFirst({ where: { id: dto.releaseId, workspaceId } });
      if (!release) throw new BadRequestException('Release not found in this workspace');
    }
    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('结束日期不能早于开始日期');
    }
    const maxSort = await this.prisma.sprint.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });
    return this.prisma.sprint.create({
      data: {
        workspaceId,
        releaseId: dto.releaseId ?? null,
        name: dto.name.trim(),
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        goal: dto.goal ?? null,
        status: dto.status ?? 'PLANNED',
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(
    workspaceId: string,
    id: string,
    dto: Partial<{ name: string; releaseId?: string | null; startDate?: string | null; endDate?: string | null; goal?: string | null; status?: string; sortOrder?: number }>,
  ) {
    const sprint = await this.getSprint(workspaceId, id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('迭代名称不能为空');
      data.name = dto.name.trim();
    }
    if (dto.releaseId !== undefined) data.releaseId = dto.releaseId ?? null;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.goal !== undefined) data.goal = dto.goal ?? null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return this.prisma.sprint.update({ where: { id: sprint.id }, data });
  }

  async remove(workspaceId: string, id: string) {
    const sprint = await this.getSprint(workspaceId, id);
    const count = await this.prisma.story.count({ where: { sprintId: sprint.id, deletedAt: null } });
    if (count > 0) throw new BadRequestException('该迭代下仍有任务，请先移出');
    await this.prisma.sprint.delete({ where: { id: sprint.id } });
    return { ok: true };
  }

  private async getSprint(workspaceId: string, id: string) {
    const sprint = await this.prisma.sprint.findFirst({ where: { id, workspaceId } });
    if (!sprint) throw new NotFoundException('Sprint not found');
    return sprint;
  }
}
