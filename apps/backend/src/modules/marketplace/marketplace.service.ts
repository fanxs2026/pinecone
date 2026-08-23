import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { validateManifest, executePluginHook, type PluginManifest, type PluginHookResult } from './plugin-runtime';
import { assertSafeOutboundUrl, isPrivateNetworkAllowed } from '../../common/utils/ssrf-guard';

/**
 * I11 插件市场（2026-08-18 骨架）+ G11 插件 SDK 真实分发（2026-08-19）：
 * - 内置注册表（含可执行插件代码）
 * - 安装 → 事件总线 outbox 消费时，对已安装插件执行 onEvent 沙箱钩子（vm 零宿主引用 + 超时）
 * - B2 修复（2026-08-19）：沙箱无任何宿主引用，插件无 I/O 原语；副作用（HTTP 通知）
 *   由宿主按钩子返回值代理执行（SSRF 校验在宿主侧，B3 同源修复）
 * - 真实分发载体（包上传/远程仓库）留待后续；当前仅支持第一方白名单插件
 */

// G11 示例插件：事件 → 自定义 HTTP 通知（安装时 config.url 配置接收端）。
// B2/B3 修复：不再在沙箱内 fetch（沙箱无 fetch），改为返回请求规格，由宿主代发并做 SSRF 校验。
const EVENT_NOTIFIER_CODE = `
module.exports = {
  async onEvent(ctx) {
    const url = ctx.config && ctx.config.url;
    if (!url) return null;
    return {
      method: 'POST',
      url: url,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Pinecone-Plugin/1.0' },
      body: JSON.stringify({
        event: ctx.eventName,
        workspaceId: ctx.workspaceId || null,
        payload: ctx.payload || null,
      })
    };
  }
};
`;

const PLUGIN_REGISTRY: PluginManifest[] = [
  {
    id: 'webhook-advanced',
    name: 'Webhook 高级模板',
    version: '1.0.0',
    description: '企微/钉钉/飞书消息模板 + 变量函数（本期预留）',
    kind: 'WEBHOOK',
    hooks: [],
    code: '',
  },
  {
    id: 'event-notifier',
    name: '事件通知器（示例插件）',
    version: '1.0.0',
    description: 'G11 SDK 示例：任意事件触发时 POST 到配置的 URL（安装后 config.url 必填）',
    kind: 'WEBHOOK',
    hooks: ['onEvent'],
    code: EVENT_NOTIFIER_CODE,
  },
  {
    id: 'report-templates',
    name: '报表模板库',
    version: '1.0.0',
    description: '月度周报 / 发布评审 / 客户反馈汇总等预设报表',
    kind: 'REPORT',
    hooks: [],
    code: '',
  },
  {
    id: 'kb-docx-export',
    name: '知识库 DOCX 导出',
    version: '1.0.0',
    description: '页面树批量导出 Word 文档（预留）',
    kind: 'KB',
    hooks: [],
    code: '',
  },
  {
    id: 'import-jira',
    name: 'Jira 导入器',
    version: '1.0.0',
    description: '从 Jira CSV/XML 导入 Story/缺陷（预留）',
    kind: 'IMPORT',
    hooks: [],
    code: '',
  },
];

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private prisma: PrismaService) {}

  /** 清单 + 当前工作区安装状态（不含 code，避免泄露实现） */
  async list(workspaceId: string) {
    const installed = await this.prisma.installedPlugin.findMany({
      where: { workspaceId },
      select: { pluginId: true, version: true, createdAt: true },
    });
    const installedMap = new Map(installed.map((i) => [i.pluginId, i]));
    return PLUGIN_REGISTRY.map(({ code, ...p }) => ({
      ...p,
      installed: installedMap.has(p.id),
      installedAt: installedMap.get(p.id)?.createdAt ?? null,
    }));
  }

  /** 已安装插件列表 */
  async installed(workspaceId: string) {
    return this.prisma.installedPlugin.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 安装插件 */
  async install(workspaceId: string, pluginId: string, userId: string) {
    const manifest = PLUGIN_REGISTRY.find((p) => p.id === pluginId);
    if (!manifest) throw new NotFoundException('Plugin not found in registry');
    if (!validateManifest(manifest)) throw new BadRequestException('Plugin manifest invalid');
    const existing = await this.prisma.installedPlugin.findUnique({
      where: { workspaceId_pluginId: { workspaceId, pluginId } },
    });
    if (existing) throw new BadRequestException('Plugin already installed');
    return this.prisma.installedPlugin.create({
      data: {
        workspaceId,
        pluginId,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        installedById: userId,
      },
    });
  }

  /** 卸载插件 */
  async uninstall(workspaceId: string, pluginId: string) {
    await this.prisma.installedPlugin.deleteMany({ where: { workspaceId, pluginId } });
    return { ok: true };
  }

  /** 更新插件配置（如 event-notifier 的 config.url） */
  async updateConfig(workspaceId: string, pluginId: string, config: Record<string, unknown>) {
    const existing = await this.prisma.installedPlugin.findUnique({
      where: { workspaceId_pluginId: { workspaceId, pluginId } },
    });
    if (!existing) throw new NotFoundException('Plugin not installed');
    // B3 修复：config.url 若存在必须通过 SSRF 校验（插件出站由宿主代发）
    const url = config?.url;
    if (typeof url === 'string' && url.trim()) {
      await assertSafeOutboundUrl(url.trim(), isPrivateNetworkAllowed());
    }
    return this.prisma.installedPlugin.update({
      where: { id: existing.id },
      data: { config: config as object },
    });
  }

  /**
   * G11 事件分发：工作区已安装插件 → 沙箱 onEvent 钩子。
   * B2/B3 修复：钩子返回值含 url 时由宿主代发 HTTP（SSRF 校验 + 3s 超时），
   * 沙箱本身无网络能力。单插件失败不影响宿主。
   */
  async dispatchEvent(workspaceId: string | null, eventName: string, payload: unknown) {
    if (!workspaceId) return;
    const installed = await this.prisma.installedPlugin.findMany({ where: { workspaceId } });
    if (installed.length === 0) return;
    for (const p of installed) {
      const manifest = PLUGIN_REGISTRY.find((x) => x.id === p.pluginId);
      if (!manifest?.code || !manifest.hooks.includes('onEvent')) continue;
      try {
        const outcome = await executePluginHook(manifest.code, 'onEvent', {
          eventName,
          workspaceId,
          payload,
          config: p.config ?? {},
        });
        // 宿主代发：插件返回 { url, ... } 请求规格
        if (outcome && typeof outcome.url === 'string' && outcome.url.trim()) {
          await this.hostNotify(outcome);
        }
        this.logger.log(`[plugin] ${p.pluginId} handled ${eventName}`);
      } catch (e) {
        this.logger.warn(`[plugin] ${p.pluginId} failed on ${eventName}: ${(e as Error).message}`);
      }
    }
  }

  /** 宿主代理 HTTP 通知（B2/B3：出站唯一通道，统一 SSRF 校验 + 超时） */
  private async hostNotify(spec: PluginHookResult): Promise<void> {
    await assertSafeOutboundUrl(spec.url!, isPrivateNetworkAllowed());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      await fetch(spec.url!, {
        method: spec.method ?? 'POST',
        headers: { 'Content-Type': 'application/json', ...(spec.headers ?? {}) },
        body: spec.body ?? '',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
