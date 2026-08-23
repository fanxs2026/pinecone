import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateTodoItemDto, UpdateTodoItemDto } from './dto/todo-item.dto';

@Injectable()
export class TodoItemsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** 校验 Idea 属于该工作区 */
  private async assertIdeaInWorkspace(workspaceId: string, ideaId: string) {
    const idea = await this.prisma.idea.findFirst({
      where: { id: ideaId, workspaceId },
    });
    if (!idea) throw new NotFoundException('Idea not found in this workspace');
    return idea;
  }

  async findAll(workspaceId: string, ideaId: string) {
    await this.assertIdeaInWorkspace(workspaceId, ideaId);
    return this.prisma.todoItem.findMany({
      where: { workspaceId, ideaId },
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, email: true, name: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async create(workspaceId: string, ideaId: string, dto: CreateTodoItemDto, userId: string) {
    await this.assertIdeaInWorkspace(workspaceId, ideaId);
    // 负责人必须是工作区成员
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: dto.assigneeId } },
    });
    if (!member) throw new BadRequestException('Assignee must be a member of this workspace');

    const todo = await this.prisma.todoItem.create({
      data: {
        workspaceId,
        ideaId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: userId,
      },
      include: {
        assignee: { select: { id: true, email: true, name: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    // 邮件通知负责人（创建时）——异步 fire-and-forget，不阻塞接口（H3 修复：SMTP 慢/挂不影响保存）
    if (todo.assignee.email) {
      void (async () => {
        try {
          const ideaTitle = (await this.prisma.idea.findUnique({ where: { id: ideaId } }))?.title || '';
          await this.mail.sendTodoNotification(todo.assignee.email, {
            todoTitle: todo.title,
            ideaTitle,
            dueDate: todo.dueDate?.toISOString().slice(0, 10),
            creatorName: todo.createdBy.name || todo.createdBy.email,
          });
        } catch (e) {
          console.error('[TodoItems] notification email failed:', (e as Error).message);
        }
      })();
    }

    return todo;
  }

  async update(workspaceId: string, ideaId: string, todoId: string, dto: UpdateTodoItemDto, userId: string) {
    const todo = await this.getOwned(workspaceId, ideaId, todoId);
    if (todo.createdById !== userId && todo.assigneeId !== userId) {
      throw new ForbiddenException('Only creator or assignee can edit this todo');
    }
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    let reassignedTo: string | null = null;
    if (dto.assigneeId !== undefined) {
      const member = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: dto.assigneeId } },
      });
      if (!member) throw new BadRequestException('Assignee must be a member of this workspace');
      data.assigneeId = dto.assigneeId;
      if (dto.assigneeId !== todo.assigneeId) reassignedTo = dto.assigneeId;
    }
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const updated = await this.prisma.todoItem.update({
      where: { id: todoId },
      data,
      include: {
        assignee: { select: { id: true, email: true, name: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });

    // P3-3 修复：改派时通知新负责人（异步，不阻塞）
    if (reassignedTo && updated.assignee?.email) {
      void (async () => {
        try {
          const ideaTitle = (await this.prisma.idea.findUnique({ where: { id: ideaId } }))?.title || '';
          await this.mail.sendTodoNotification(updated.assignee!.email, {
            todoTitle: updated.title,
            ideaTitle,
            dueDate: updated.dueDate?.toISOString().slice(0, 10),
            creatorName: updated.createdBy.name || updated.createdBy.email,
          });
        } catch (e) {
          console.error('[TodoItems] reassign notification failed:', (e as Error).message);
        }
      })();
    }

    return updated;
  }

  /** 完成/取消完成：仅创建人或负责人可操作；记录实际完成时间 */
  async setCompleted(workspaceId: string, ideaId: string, todoId: string, completed: boolean, userId: string) {
    const todo = await this.getOwned(workspaceId, ideaId, todoId);
    if (todo.createdById !== userId && todo.assigneeId !== userId) {
      throw new ForbiddenException('Only creator or assignee can complete this todo');
    }
    return this.prisma.todoItem.update({
      where: { id: todoId },
      data: {
        completedAt: completed ? new Date() : null,
        completedById: completed ? userId : null,
      },
      include: {
        assignee: { select: { id: true, email: true, name: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async remove(workspaceId: string, ideaId: string, todoId: string, userId: string) {
    const todo = await this.getOwned(workspaceId, ideaId, todoId);
    if (todo.createdById !== userId) {
      throw new ForbiddenException('Only creator can delete this todo');
    }
    await this.prisma.todoItem.delete({ where: { id: todoId } });
    return { success: true };
  }

  private async getOwned(workspaceId: string, ideaId: string, todoId: string) {
    await this.assertIdeaInWorkspace(workspaceId, ideaId);
    const todo = await this.prisma.todoItem.findFirst({
      where: { id: todoId, workspaceId, ideaId },
    });
    if (!todo) throw new NotFoundException('Todo item not found');
    return todo;
  }
}
