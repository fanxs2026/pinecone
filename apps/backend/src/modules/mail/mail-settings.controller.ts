import { Controller, Get, Put, Post, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, IsOptional, IsEmail } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SmtpSettingsService, type SaveSmtpDto } from './smtp-settings.service';

export class SaveSmtpBody implements SaveSmtpDto {
  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsEmail()
  user!: string;

  /** 留空 = 保留已存密码 */
  @IsString()
  @IsOptional()
  pass?: string;

  /** 支持 "Name <email>" 格式 */
  @IsString()
  @IsOptional()
  from?: string;
}

@ApiTags('Admin Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/settings/smtp')
export class MailSettingsController {
  constructor(private readonly smtp: SmtpSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get SMTP config (admin, pass masked)' })
  get(@Req() req: any) {
    this.smtp.assertAdmin(req.user);
    return this.smtp.getConfig();
  }

  @Put()
  @ApiOperation({ summary: 'Save SMTP config (admin)' })
  save(@Req() req: any, @Body() dto: SaveSmtpBody) {
    this.smtp.assertAdmin(req.user);
    return this.smtp.saveConfig(dto);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send test email to current admin (admin)' })
  async test(@Req() req: any) {
    this.smtp.assertAdmin(req.user);
    return this.smtp.sendTestEmail(req.user.email);
  }
}
