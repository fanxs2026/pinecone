import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsService } from '../events/events.service';
import { EntityType, ActionType } from '../../generated/enums';
import { CreateCommentDto } from './dto/create-comment.dto';
import type { Prisma } from '../../generated/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private activitiesService: ActivitiesService,
    private notificationsService: NotificationsService,
    private eventsService: EventsService,
  ) {}

  async create(workspaceId: string, dto: CreateCommentDto, userId: string) {
    const comment = await this.prisma.comment.create({
      data: {
        workspaceId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        content: dto.content,
        userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    // P2：评论事件（Webhook/Slack 订阅，事件名 COMMENT.CREATED）
    await this.eventsService.publish({
      workspaceId,
      entityType: 'COMMENT',
      entityId: comment.id,
      action: 'CREATED',
      payload: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        content: dto.content.slice(0, 500),
        author: comment.user?.name || comment.user?.email || null,
      },
    });

    await this.activitiesService.log(
      dto.entityType,
      dto.entityId,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { action: 'COMMENT_CREATED', commentId: comment.id } as unknown as Prisma.InputJsonValue,
    );

    // @提及解析 → 通知被提及成员（MENTION，含邮件）
    await this.notificationsService.parseMentionsAndNotify({
      workspaceId,
      text: dto.content,
      actorId: userId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });

    return comment;
  }

  async findByEntity(
    workspaceId: string,
    entityType: string,
    entityId: string,
    skip: number = 0,
    take: number = 50,
  ): Promise<PaginatedResult<any>> {
    const where = { workspaceId, entityType: entityType as EntityType, entityId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  /** 编辑评论：仅作者本人可编辑（管理员也不能改他人评论） */
  async update(workspaceId: string, id: string, content: string, userId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id, workspaceId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) {
      throw new ForbiddenException('Cannot edit another user\'s comment');
    }
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content },
    });
    await this.activitiesService.log(
      comment.entityType as EntityType,
      comment.entityId,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { action: 'COMMENT_UPDATED', commentId: id } as unknown as Prisma.InputJsonValue,
    );
    return updated;
  }

  async remove(workspaceId: string, id: string, userId: string, role?: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const comment = await this.prisma.comment.findFirst({
      where: { id, workspaceId },
    });

    if (!comment) throw new NotFoundException('Comment not found');
    // Author can delete their own comment; workspace admins can delete any
    if (comment.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Cannot delete another user\'s comment');
    }

    await this.prisma.comment.delete({ where: { id } });

    await this.activitiesService.log(
      comment.entityType as EntityType,
      comment.entityId,
      ActionType.UPDATED,
      userId,
      workspaceId,
      { action: 'COMMENT_DELETED', commentId: id } as unknown as Prisma.InputJsonValue,
    );
  }
}
