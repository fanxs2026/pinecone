import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        _count: {
          select: { members: true, ideas: true, features: true, stories: true },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true, avatar: true },
            },
          },
        },
        _count: {
          select: { ideas: true, releases: true, features: true, stories: true },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const isMember = workspace.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  async create(dto: CreateWorkspaceDto, userId: string) {
    const existing = await this.prisma.workspace.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Slug already taken');
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        members: {
          create: {
            userId,
            role: 'ADMIN',
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    return workspace;
  }

  async update(id: string, dto: UpdateWorkspaceDto) {
    if (dto.slug) {
      const existing = await this.prisma.workspace.findUnique({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Slug already taken');
      }
    }

    try {
      return await this.prisma.workspace.update({
        where: { id },
        data: dto,
      });
    } catch {
      throw new NotFoundException('Workspace not found');
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.workspace.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Workspace not found');
    }
  }

  async inviteMember(workspaceId: string, dto: InviteMemberDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      // OWASP: do not reveal whether an email is registered (user enumeration)
      throw new NotFoundException('Invitation could not be completed');
    }

    const existing = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException('User is already a member');
    }

    return this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        role: dto.role as any,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });
  }

  async removeMember(workspaceId: string, userId: string, currentUserId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'ADMIN') {
      const adminCount = await this.prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' },
      });
      // 最后一名 admin 不可被移除（包括自己移除自己）——否则工作区成员归零被孤儿化
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin');
      }
    }

    await this.prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });
  }

  /**
   * 工作区成员列表（含 user 信息），按显示名（name || email）字母序从小到大（升序）排列。
   */
  async getMembers(workspaceId: string) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatar: true },
        },
      },
    });

    return members.sort((a, b) => {
      const na = (a.user.name || a.user.email).toLowerCase();
      const nb = (b.user.name || b.user.email).toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });
  }

  async getAllTags(workspaceId: string): Promise<string[]> {    const [ideaTags, featureTags, supportTags] = await this.prisma.$transaction([
      this.prisma.idea.findMany({ where: { workspaceId }, select: { tags: true } }),
      this.prisma.feature.findMany({ where: { workspaceId }, select: { tags: true } }),
      this.prisma.support.findMany({ where: { workspaceId }, select: { tags: true } }),
    ]);

    const allTags = new Set<string>();
    for (const item of ideaTags) item.tags.forEach((t: string) => allTags.add(t));
    for (const item of featureTags) item.tags.forEach((t: string) => allTags.add(t));
    for (const item of supportTags) item.tags.forEach((t: string) => allTags.add(t));

    return Array.from(allTags).sort();
  }

  async updateMemberRole(workspaceId: string, userId: string, dto: UpdateMemberRoleDto) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === 'ADMIN' && dto.role !== 'ADMIN') {
      const adminCount = await this.prisma.workspaceMember.count({
        where: { workspaceId, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot demote the last admin');
      }
    }

    return this.prisma.workspaceMember.update({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      data: { role: dto.role as any },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }
}
