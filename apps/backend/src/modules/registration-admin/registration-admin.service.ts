import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { getEffectiveRegistrationMode } from '../../common/config/registration-mode';
import { AddWhitelistDto, CreateInviteCodeDto, UpdateInviteCodeDto } from './dto/registration-admin.dto';

/**
 * 注册控制管理（白名单 + 邀请码）。
 * 权限：仅 REGISTRATION_ADMIN_EMAILS 中列出的用户（逗号分隔邮箱）可操作。
 * 未配置时默认仅第一个注册用户？不——未配置则禁止管理（安全默认）。
 */
@Injectable()
export class RegistrationAdminService {
  constructor(private prisma: PrismaService) {}

  private isAdmin(user: { id: string; email: string }): boolean {
    const admins = (process.env.REGISTRATION_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (admins.length === 0) return false;
    return admins.includes(user.email.toLowerCase());
  }

  assertAdmin(user: { id: string; email: string }) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('You are not authorized to manage registration');
    }
  }

  getMode(): string {
    // P1-2/F-005：与 auth 共用 fail-closed helper，避免管理端显示与实际注册策略不一致
    return getEffectiveRegistrationMode();
  }

  // ── 白名单 ──
  async listWhitelist(page = 1, pageSize = 15, search = '') {
    const where = search
      ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { note: { contains: search, mode: 'insensitive' as const } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.registrationWhitelist.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.registrationWhitelist.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async addWhitelist(dto: AddWhitelistDto, userId: string) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.registrationWhitelist.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already whitelisted');
    return this.prisma.registrationWhitelist.create({
      data: { email, note: dto.note, createdById: userId },
    });
  }

  async removeWhitelist(id: string) {
    const existing = await this.prisma.registrationWhitelist.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Whitelist entry not found');
    await this.prisma.registrationWhitelist.delete({ where: { id } });
    return { success: true };
  }

  // ── 邀请码 ──
  async listInviteCodes(page = 1, pageSize = 15, search = '') {
    const where = search
      ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { note: { contains: search, mode: 'insensitive' as const } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inviteCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inviteCode.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createInviteCode(dto: CreateInviteCodeDto, userId: string) {
    const code = dto.code?.trim() || randomBytes(5).toString('hex').toUpperCase();
    const existing = await this.prisma.inviteCode.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Invite code already exists');
    return this.prisma.inviteCode.create({
      data: {
        code,
        note: dto.note,
        maxUses: dto.maxUses || 1,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: userId,
      },
    });
  }

  async updateInviteCode(id: string, dto: UpdateInviteCodeDto) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Invite code not found');
    const data: any = {};
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.maxUses !== undefined) data.maxUses = dto.maxUses;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    return this.prisma.inviteCode.update({ where: { id }, data });
  }

  async deleteInviteCode(id: string) {
    const existing = await this.prisma.inviteCode.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Invite code not found');
    await this.prisma.inviteCode.delete({ where: { id } });
    return { success: true };
  }

  // ── 用户管理（禁用/启用）──
  async listUsers(page = 1, pageSize = 15, search = '') {
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const select = {
      id: true,
      email: true,
      name: true,
      active: true,
      createdAt: true,
      _count: { select: { workspaceMembers: true, createdIdeas: true } },
    } as const;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async setUserActive(userId: string, active: boolean, operatorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (userId === operatorId && !active) {
      throw new ForbiddenException('You cannot disable your own account');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { active },
      select: { id: true, email: true, name: true, active: true },
    });
  }
}
