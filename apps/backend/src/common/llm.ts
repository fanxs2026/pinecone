import { Logger } from '@nestjs/common';

/**
 * 公共 LLM 调用助手（P1）：BYO（Bring Your Own）模型接入。
 *
 * 配置（环境变量，不落库）：
 *   AI_API_KEY   - OpenAI 兼容 API key（必填启用 LLM；缺省返回 { ok:false } 由调用方降级）
 *   AI_BASE_URL  - 兼容端点基础 URL（默认 https://api.openai.com/v1）
 *   AI_MODEL     - 模型名（默认 gpt-4o-mini）
 *
 * 安全：调用方只应发送结构化聚合数据（无个人敏感明细）；system prompt 固定；响应仅取文本。
 */

const logger = new Logger('Llm');

export function llmEnabled(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
  /** 请求 JSON 模式响应（OpenAI response_format） */
  json?: boolean;
}

export type LlmResult = { ok: true; text: string } | { ok: false; reason?: string };

/**
 * OpenAI 兼容 chat completions 调用。
 * 缺 key / 调用失败一律返回 { ok:false }，绝不抛错——由上层模板降级。
 */
export async function callLlm(system: string, user: string, opts?: LlmCallOptions): Promise<LlmResult> {
  if (!llmEnabled()) return { ok: false, reason: 'AI_API_KEY not configured' };
  try {
    const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.AI_MODEL || 'gpt-4o-mini';
    const temperature = opts?.temperature ?? 0.4;
    const maxTokens = opts?.maxTokens ?? 600;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(opts?.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      logger.warn(`LLM call failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) return { ok: false, reason: 'empty response' };
    return { ok: true, text };
  } catch (err: any) {
    logger.warn(`LLM call error: ${err?.message}`);
    return { ok: false, reason: err?.message };
  }
}

/** 从 LLM 文本中提取 JSON（容忍 ```json 包裹 / 前后杂文），失败返回 null */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
