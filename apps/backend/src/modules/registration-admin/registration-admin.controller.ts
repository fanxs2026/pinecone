import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RegistrationAdminService } from './registration-admin.service';
import { AddWhitelistDto, CreateInviteCodeDto, UpdateInviteCodeDto, SetUserActiveDto } from './dto/registration-admin.dto';

interface AuthedRequest extends Request {
  user?: { id: string; email: string; name?: string; [k: string]: any };
}

@ApiTags('Registration Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('registration-admin')
export class RegistrationAdminController {
  constructor(private service: RegistrationAdminService) {}

  /** P2-10 修复：页码 clamp 到 >=1（负数/0 → 1），防 Prisma skip 负数 500 */
  private clampPage(v?: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private clampPageSize(v?: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 100) : 15;
  }

  @Get('mode')
  @ApiOperation({ summary: 'Get current registration mode' })
  getMode(@Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return { mode: this.service.getMode() };
  }

  @Get('whitelist')
  @ApiOperation({ summary: 'List whitelisted emails (paginated, searchable)' })
  listWhitelist(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    this.service.assertAdmin(req.user!);
    return this.service.listWhitelist(
      this.clampPage(page),
      this.clampPageSize(pageSize),
      search || '',
    );
  }

  @Post('whitelist')
  @ApiOperation({ summary: 'Add email to whitelist' })
  addWhitelist(@Body() dto: AddWhitelistDto, @Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return this.service.addWhitelist(dto, req.user!.id);
  }

  @Delete('whitelist/:id')
  @ApiOperation({ summary: 'Remove email from whitelist' })
  removeWhitelist(@Param('id') id: string, @Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return this.service.removeWhitelist(id);
  }

  @Get('invite-codes')
  @ApiOperation({ summary: 'List invite codes (paginated, searchable)' })
  listInviteCodes(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    this.service.assertAdmin(req.user!);
    return this.service.listInviteCodes(
      this.clampPage(page),
      this.clampPageSize(pageSize),
      search || '',
    );
  }

  @Post('invite-codes')
  @ApiOperation({ summary: 'Create invite code (auto-generate if empty)' })
  createInviteCode(@Body() dto: CreateInviteCodeDto, @Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return this.service.createInviteCode(dto, req.user!.id);
  }

  @Patch('invite-codes/:id')
  @ApiOperation({ summary: 'Update invite code (activate/deactivate/limits)' })
  updateInviteCode(@Param('id') id: string, @Body() dto: UpdateInviteCodeDto, @Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return this.service.updateInviteCode(id, dto);
  }

  @Delete('invite-codes/:id')
  @ApiOperation({ summary: 'Delete invite code' })
  deleteInviteCode(@Param('id') id: string, @Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return this.service.deleteInviteCode(id);
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin, paginated, searchable)' })
  listUsers(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    this.service.assertAdmin(req.user!);
    return this.service.listUsers(
      this.clampPage(page),
      this.clampPageSize(pageSize),
      search || '',
    );
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Enable / disable a user account' })
  setUserActive(@Param('id') id: string, @Body() dto: SetUserActiveDto, @Req() req: AuthedRequest) {
    this.service.assertAdmin(req.user!);
    return this.service.setUserActive(id, dto.active, req.user!.id);
  }
}
