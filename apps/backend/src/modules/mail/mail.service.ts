import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * 邮件发送服务（nodemailer）。
 * - 未配置 SMTP（EMAIL_HOST 为空）时 isConfigured()=false，调用方走演示模式（返回重置链接）
 * - 配置来源（2026-08-21 起支持两级，DB 优先）：
 *   1. 平台设置表 settings['smtp']（管理员前端配置，pass 经 secret-cipher 加密落库）——优先
 *   2. .env 兜底（首跑/未在 UI 配置时）：
 *      EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS / EMAIL_FROM
 * - `reconfigure()` 由 SmtpSettingsService 在启动与保存后调用，重建 transporter。
 */
export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from?: string;
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private from: string = 'no-reply';

  constructor() {
    this.reconfigureFromEnv();
  }

  /** 从 .env 构建 transporter（默认配置源） */
  private reconfigureFromEnv(): void {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (host && user && pass) {
      this.reconfigure({ host, port: Number(process.env.EMAIL_PORT || 465), user, pass, from: process.env.EMAIL_FROM });
    }
  }

  /** 以给定配置重建 transporter（DB 配置覆盖 env 时调用） */
  reconfigure(opts: SmtpOptions): void {
    this.transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465, // 465 用 SSL；587 用 STARTTLS
      auth: { user: opts.user, pass: opts.pass },
      tls: { rejectUnauthorized: false }, // 163 等国内邮箱证书链兼容
      connectionTimeout: 8000, // 8s 连接超时：配置错误时快速失败（测试邮件不挂起）
      greetingTimeout: 8000,
    });
    this.from = opts.from || opts.user;
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
    if (!this.transporter) return false;
    const from = this.from;
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: '【Pinecone】密码重置',
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color:#1e293b;">重置 Pinecone 密码</h2>
            <p style="color:#475569;">我们收到了您的密码重置请求。请点击下面的链接设置新密码：</p>
            <p><a href="${escapeHtml(resetLink)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">重置密码</a></p>
            <p style="color:#94a3b8;font-size:12px;">链接 30 分钟内有效，且只能使用一次。如果这不是您的操作，请忽略此邮件。</p>
          </div>`,
      });
      return true;
    } catch (e) {
      console.error('[MailService] sendPasswordResetEmail failed:', (e as Error).message);
      return false;
    }
  }

  /** 发送 to-do 任务分配通知邮件；未配置 SMTP 时返回 false（不阻断业务） */
  async sendTodoNotification(
    to: string,
    info: { todoTitle: string; ideaTitle: string; dueDate?: string; creatorName: string },
  ): Promise<boolean> {
    if (!this.transporter) return false;
    const from = this.from;
    // H2 修复：所有用户输入转义 HTML，防止邮件注入/钓鱼链接
    const esc = escapeHtml;
    const subject = cleanHeader(`【Pinecone】您有新任务：${info.todoTitle}`);
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color:#1e293b;">您被分配了一个新任务</h2>
            <p style="color:#475569;">${esc(info.creatorName)} 在需求「${esc(info.ideaTitle)}」中为您分配了任务：</p>
            <div style="border-left:3px solid #0f766e;padding:8px 14px;background:#f8fafc;border-radius:4px;margin:12px 0;">
              <p style="margin:0;font-weight:600;color:#0f172a;">${esc(info.todoTitle)}</p>
            </div>
            ${info.dueDate ? `<p style="color:#475569;">要求完成日期：<strong style="color:#b45309;">${esc(info.dueDate)}</strong></p>` : ''}
            <p style="color:#94a3b8;font-size:12px;">请登录 Pinecone 查看任务详情并按时完成。</p>
          </div>`,
      });
      return true;
    } catch (e) {
      console.error('[MailService] sendTodoNotification failed:', (e as Error).message);
      return false;
    }
  }

  /** 通用站内通知邮件（@提及 / 指派等）——SMTP 未配置时静默跳过 */
  async sendNotificationEmail(
    to: string,
    info: { actorName: string; typeLabel: string; entityTitle: string; snippet?: string; link: string },
  ): Promise<boolean> {
    if (!this.transporter) return false;
    const from = this.from;
    const esc = escapeHtml;
    const subject = cleanHeader(`【Pinecone】${info.typeLabel}：${info.entityTitle}`);
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color:#1e293b;">${esc(info.typeLabel)}</h2>
            <p style="color:#475569;">${esc(info.actorName)} 在「<strong>${esc(info.entityTitle)}</strong>」中提到了您：</p>
            ${info.snippet ? `<div style="border-left:3px solid #0f766e;padding:8px 14px;background:#f8fafc;border-radius:4px;margin:12px 0;color:#334155;">${esc(info.snippet)}</div>` : ''}
            <p><a href="${esc(info.link)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">查看详情</a></p>
            <p style="color:#94a3b8;font-size:12px;">此邮件由 Pinecone 自动发送，请勿直接回复。</p>
          </div>`,
      });
      return true;
    } catch (e) {
      console.error('[MailService] sendNotificationEmail failed:', (e as Error).message);
      return false;
    }
  }

  /** P1 报表订阅摘要邮件（2026-08-19）：SMTP 未配置时静默跳过 */
  async sendReportDigestEmail(to: string, subscriptionName: string, snippet: string): Promise<boolean> {
    if (!this.transporter) return false;
    const from = this.from;
    const esc = escapeHtml;
    const subject = cleanHeader(`【Pinecone】报表订阅：${subscriptionName}`);
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color:#1e293b;">📊 ${esc(subscriptionName)}</h2>
            <div style="border-left:3px solid #0f766e;padding:10px 14px;background:#f8fafc;border-radius:4px;margin:12px 0;color:#334155;line-height:1.6;">${esc(snippet)}</div>
            <p style="color:#94a3b8;font-size:12px;">此邮件由 Pinecone 定时报表订阅自动发送，可在 工作区设置 → 报表订阅 中管理。</p>
          </div>`,
      });
      return true;
    } catch (e) {
      console.error('[MailService] sendReportDigestEmail failed:', (e as Error).message);
      return false;
    }
  }
}

/** HTML 转义（防邮件 HTML 注入） */
function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 邮件 header 清理（去换行，防 header 注入） */
function cleanHeader(v: string): string {
  return String(v).replace(/[\r\n]+/g, ' ').slice(0, 120);
}
