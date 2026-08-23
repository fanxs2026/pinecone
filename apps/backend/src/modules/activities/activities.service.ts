import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityType, ActionType } from '../../generated/enums';
import type { Prisma } from '../../generated/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { getClientIp } from '../../common/request-context';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async log(
    entityType: EntityType,
    entityId: string,
    action: ActionType,
    userId: string,
    workspaceId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.activity.create({
      data: {
        workspaceId,
        entityType,
        entityId,
        action,
        userId,
        metadata: metadata ?? undefined,
        // 2026-08-19：请求级上下文（ALS）自动捕获客户端 IP，无需调用点传参
        ip: getClientIp(),
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async findByEntity(
    workspaceId: string,
    entityType: EntityType,
    entityId: string,
    skip: number = 0,
    take: number = 50,
  ): Promise<PaginatedResult<any>> {
    const where = { workspaceId, entityType, entityId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { items, total, skip, take };
  }
}
