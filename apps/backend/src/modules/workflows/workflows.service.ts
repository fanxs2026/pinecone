import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityType, UserRole } from '../../generated/enums';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateTransitionDto } from './dto/create-transition.dto';
import { UpdateTransitionDto } from './dto/update-transition.dto';
import { PaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  // ── Workflow CRUD ──────────────────────────────────────────

  async findAll(
    workspaceId: string,
    skip: number = 0,
    take: number = 50,
  ): Promise<PaginatedResult<any>> {
    const where = { workspaceId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflow.findMany({
        where,
        skip,
        take,
        include: {
          statuses: {
            orderBy: { sortOrder: 'asc' },
            include: {
              transitionsFrom: { include: { toStatus: true } },
              transitionsTo: { include: { fromStatus: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async findOne(workspaceId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, workspaceId },
      include: {
        statuses: {
          orderBy: { sortOrder: 'asc' },
          include: {
            transitionsFrom: {
              include: { toStatus: { select: { id: true, name: true, color: true } } },
            },
          },
        },
      },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async findByEntity(workspaceId: string, entityType: EntityType) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { workspaceId_entityType: { workspaceId, entityType } },
      include: {
        statuses: {
          orderBy: { sortOrder: 'asc' },
          include: {
            transitionsFrom: { include: { toStatus: true } },
          },
        },
      },
    });
    if (!workflow) throw new NotFoundException('No workflow found for this entity type');
    return workflow;
  }

  async create(workspaceId: string, dto: CreateWorkflowDto) {
    const existing = await this.prisma.workflow.findUnique({
      where: { workspaceId_entityType: { workspaceId, entityType: dto.entityType } },
    });
    if (existing) {
      throw new ConflictException(`A workflow for ${dto.entityType} already exists in this workspace`);
    }

    return this.prisma.workflow.create({
      data: {
        workspaceId,
        name: dto.name,
        entityType: dto.entityType,
      },
      include: { statuses: true },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateWorkflowDto) {
    await this.findOne(workspaceId, id);

    if (dto.entityType) {
      const existing = await this.prisma.workflow.findFirst({
        where: {
          workspaceId,
          entityType: dto.entityType,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException(`A workflow for ${dto.entityType} already exists in this workspace`);
      }
    }

    return this.prisma.workflow.update({
      where: { id },
      data: dto,
      include: { statuses: true },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.workflow.delete({ where: { id } });
  }

  // ── Status CRUD ────────────────────────────────────────────

  async addStatus(workspaceId: string, workflowId: string, dto: CreateStatusDto) {
    await this.findOne(workspaceId, workflowId);

    const maxSort = await this.prisma.storyStatus.aggregate({
      where: { workflowId },
      _max: { sortOrder: true },
    });

    return this.prisma.storyStatus.create({
      data: {
        workflowId,
        name: dto.name,
        color: dto.color || '#6B7280',
        type: dto.type || 'CUSTOM',
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateStatus(workspaceId: string, statusId: string, dto: UpdateStatusDto) {
    await this.verifyStatusOwnership(workspaceId, statusId);
    return this.prisma.storyStatus.update({
      where: { id: statusId },
      data: dto,
    });
  }

  async removeStatus(workspaceId: string, statusId: string) {
    await this.verifyStatusOwnership(workspaceId, statusId);
    // Delete associated transitions first (cascade should handle, but explicit for safety)
    await this.prisma.statusTransition.deleteMany({
      where: { OR: [{ fromStatusId: statusId }, { toStatusId: statusId }] },
    });
    await this.prisma.storyStatus.delete({ where: { id: statusId } });
  }

  async reorderStatuses(
    workspaceId: string,
    workflowId: string,
    statusOrder: { id: string; sortOrder: number }[],
  ) {
    await this.findOne(workspaceId, workflowId);

    await Promise.all(
      statusOrder.map((s) =>
        this.prisma.storyStatus.update({
          where: { id: s.id },
          data: { sortOrder: s.sortOrder },
        }),
      ),
    );

    return this.prisma.storyStatus.findMany({
      where: { workflowId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Transition CRUD ────────────────────────────────────────

  async addTransition(workspaceId: string, dto: CreateTransitionDto) {
    const fromStatus = await this.prisma.storyStatus.findFirst({
      where: { id: dto.fromStatusId },
      include: { workflow: true },
    });
    if (!fromStatus || fromStatus.workflow.workspaceId !== workspaceId) {
      throw new BadRequestException('From-status not found in this workspace');
    }

    const toStatus = await this.prisma.storyStatus.findFirst({
      where: { id: dto.toStatusId },
      include: { workflow: true },
    });
    if (!toStatus || toStatus.workflow.workspaceId !== workspaceId) {
      throw new BadRequestException('To-status not found in this workspace');
    }

    if (fromStatus.workflowId !== toStatus.workflowId) {
      throw new BadRequestException('Statuses must belong to the same workflow');
    }

    const existing = await this.prisma.statusTransition.findUnique({
      where: { fromStatusId_toStatusId: { fromStatusId: dto.fromStatusId, toStatusId: dto.toStatusId } },
    });
    if (existing) {
      throw new ConflictException('This transition already exists');
    }

    return this.prisma.statusTransition.create({
      data: {
        fromStatusId: dto.fromStatusId,
        toStatusId: dto.toStatusId,
        allowedRoles: dto.allowedRoles || [UserRole.ADMIN, UserRole.MEMBER],
      },
      include: {
        fromStatus: true,
        toStatus: true,
      },
    });
  }

  async updateTransition(workspaceId: string, id: string, dto: UpdateTransitionDto) {
    const transition = await this.prisma.statusTransition.findUnique({
      where: { id },
      include: { fromStatus: { include: { workflow: true } } },
    });
    if (!transition || transition.fromStatus.workflow.workspaceId !== workspaceId) {
      throw new NotFoundException('Transition not found');
    }

    return this.prisma.statusTransition.update({
      where: { id },
      data: dto,
      include: { fromStatus: true, toStatus: true },
    });
  }

  async removeTransition(workspaceId: string, id: string) {
    const transition = await this.prisma.statusTransition.findUnique({
      where: { id },
      include: { fromStatus: { include: { workflow: true } } },
    });
    if (!transition || transition.fromStatus.workflow.workspaceId !== workspaceId) {
      throw new NotFoundException('Transition not found');
    }

    await this.prisma.statusTransition.delete({ where: { id } });
  }

  // ── Validation Helper ──────────────────────────────────────

  async getAllowedTransitions(
    workspaceId: string,
    workflowId: string,
    currentStatusId: string,
    userRole: UserRole,
  ) {
    await this.findOne(workspaceId, workflowId);

    const status = await this.prisma.storyStatus.findFirst({
      where: { id: currentStatusId, workflowId },
    });
    if (!status) throw new NotFoundException('Status not found in this workflow');

    const transitions = await this.prisma.statusTransition.findMany({
      where: { fromStatusId: currentStatusId },
      include: { toStatus: { select: { id: true, name: true, color: true } } },
    });

    return transitions
      .filter((t) => t.allowedRoles.includes(userRole))
      .map((t) => t.toStatus);
  }

  // ── Private Helpers ────────────────────────────────────────

  private async verifyStatusOwnership(workspaceId: string, statusId: string) {
    const status = await this.prisma.storyStatus.findUnique({
      where: { id: statusId },
      include: { workflow: true },
    });
    if (!status || status.workflow.workspaceId !== workspaceId) {
      throw new NotFoundException('Status not found');
    }
    return status;
  }
  // ── 状态校验（P0-②：实体 service 集成用）──────────────────

  /** 获取实体状态列表（无自定义工作流 → 系统默认） */
  async getStatuses(workspaceId: string, entityType: EntityType): Promise<string[]> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { workspaceId_entityType: { workspaceId, entityType } },
      include: { statuses: { orderBy: { sortOrder: 'asc' }, select: { name: true } } },
    });
    // 2026-08-14 修复：工作流行存在但状态子行为空（种子缺失/数据漂移）时降级为默认状态集，
    // 否则 validateStatus 永远 false，任何状态更新都报 Invalid status
    if (workflow && workflow.statuses.length > 0) {
      return workflow.statuses.map((s) => s.name);
    }
    return (DEFAULT_ENTITY_STATUSES[entityType] ?? []).map((s) => s.key);
  }

  /** 校验状态在配置（或默认）列表内 */
  async validateStatus(workspaceId: string, entityType: EntityType, status: string): Promise<boolean> {
    const list = await this.getStatuses(workspaceId, entityType);
    return list.includes(status);
  }

  /** 校验转换是否允许（无转换限制 → 允许） */
  async canTransition(workspaceId: string, entityType: EntityType, from: string | null, to: string): Promise<boolean> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { workspaceId_entityType: { workspaceId, entityType } },
      include: { statuses: { include: { transitionsFrom: true } } },
    });
    if (!workflow || !from) return true; // 未配置工作流 → 不限制；初始状态 → 不限制
    const fromStatus = workflow.statuses.find((s) => s.name === from);
    const toStatus = workflow.statuses.find((s) => s.name === to);
    if (!fromStatus || !toStatus) return true; // 未知状态交由 validateStatus 拦截
    if (fromStatus.transitionsFrom.length === 0) return true; // 无 outgoing 限制 → 允许
    return fromStatus.transitionsFrom.some((t) => t.toStatusId === toStatus.id);
  }

  /** 获取实体状态配置详情（前端面板：含 color/transitions）——无配置返回默认 */
  async getStatusConfig(workspaceId: string, entityType: EntityType) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { workspaceId_entityType: { workspaceId, entityType } },
      include: {
        statuses: {
          orderBy: { sortOrder: 'asc' },
          include: { transitionsFrom: { include: { toStatus: { select: { id: true, name: true } } } } },
        },
      },
    });
    // 2026-08-14：工作流行存在但状态为空（数据漂移）→ 降级为默认状态集（与 getStatuses 一致）
    if (workflow && workflow.statuses.length > 0) {
      return {
        workflowId: workflow.id,
        name: workflow.name,
        custom: true,
        statuses: workflow.statuses.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          transitionsTo: s.transitionsFrom.map((t) => ({ statusId: t.toStatusId, statusName: t.toStatus.name })),
        })),
      };
    }
    return {
      workflowId: null,
      name: '',
      custom: false,
      statuses: (DEFAULT_ENTITY_STATUSES[entityType] ?? []).map((s) => ({ id: null, name: s.key, color: null, transitionsTo: [] })),
    };
  }

}

const DEFAULT_ENTITY_STATUSES: Record<EntityType, Array<{ key: string }>> = {
  STORY: [
    { key: 'OPEN' }, { key: 'IN_PROGRESS' }, { key: 'REVIEW' }, { key: 'DONE' }, { key: 'BLOCKED' },
  ],
  IDEA: [
    { key: 'DRAFT' }, { key: 'OPEN' }, { key: 'IN_REVIEW' }, { key: 'PLANNED' }, { key: 'SHIPPED' },
    { key: 'REJECTED' }, { key: 'ALREADY_EXISTING' }, { key: 'DUPLICATED' },
  ],
  FEATURE: [
    { key: 'OPEN' }, { key: 'READY_FOR_GROOMING' }, { key: 'DECOMPOSITION' }, { key: 'IN_DEVELOPING' },
    { key: 'IN_VERIFICATION' }, { key: 'CLOSED' },
  ],
  SUPPORT: [
    { key: 'OPEN' }, { key: 'IN_REVIEW' }, { key: 'CLOSED' },
  ],
  TEST_CASE: [],
  IMPORT_JOB: [],
};
