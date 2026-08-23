/**
 * 多 VCS 入站事件解析器（P1-C：GitHub / GitLab / Gitee → 统一事件结构）。
 *
 * 三平台 webhook payload 结构差异大，这里统一为 VcsEvent：
 * - GitHub:  X-GitHub-Event 头；repository.full_name；push: ref/commits；pr: pull_request
 * - GitLab:  X-Gitlab-Event 头（Push Hook / Merge Request Hook）；project.path_with_namespace；push: ref/commits；pr: object_attributes
 * - Gitee:   X-Gitee-Event 头（Push Hook / Pull Request Hook）；repository.full_name；push: ref/commits；pr: pull_request
 */

export type VcsProvider = 'GITHUB' | 'GITLAB' | 'GITEE';

export interface VcsCommit {
  id: string;
  message: string;
  url?: string | null;
  author?: string | null;
}

export interface VcsPr {
  number: number;
  title: string;
  body?: string | null;
  url?: string | null;
  author?: string | null;
  merged: boolean;
  state: string; // GitHub: open/closed；GitLab: opened/merged/closed；Gitee: open/closed/merged
}

export interface VcsEvent {
  kind: 'push' | 'pr';
  repoFullName: string;
  branch?: string;
  commits?: VcsCommit[];
  pr?: VcsPr;
}

/** 从请求头识别平台；无法识别返回 null */
export function detectVcsProvider(headers: Record<string, string | undefined>): VcsProvider | null {
  if (headers['x-github-event']) return 'GITHUB';
  if (headers['x-gitlab-event']) return 'GITLAB';
  if (headers['x-gitee-event']) return 'GITEE';
  return null;
}

function normRepo(name: string | undefined | null): string | null {
  if (!name) return null;
  return name.trim().replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
}

/** 解析平台事件 → 统一 VcsEvent；无法识别返回 null */
export function parseVcsEvent(provider: VcsProvider, payload: any): VcsEvent | null {
  if (!payload || typeof payload !== 'object') return null;

  if (provider === 'GITHUB') {
    const repo = normRepo(payload?.repository?.full_name);
    if (!repo) return null;
    if (payload?.commits || payload?.ref) {
      const commits: VcsCommit[] = (payload.commits ?? []).map((c: any) => ({
        id: c.id || '',
        message: c.message || '',
        url: c.url || null,
        author: c.author?.name || c.author?.username || null,
      }));
      return {
        kind: 'push',
        repoFullName: repo,
        branch: (payload.ref || '').replace('refs/heads/', ''),
        commits,
      };
    }
    if (payload?.pull_request) {
      const pr = payload.pull_request;
      return {
        kind: 'pr',
        repoFullName: repo,
        pr: {
          number: pr.number ?? 0,
          title: pr.title || '',
          body: pr.body ?? null,
          url: pr.html_url || null,
          author: pr.user?.login || null,
          merged: !!pr.merged,
          state: pr.merged ? 'merged' : (pr.state === 'closed' ? 'closed' : 'open'),
        },
      };
    }
    return null;
  }

  if (provider === 'GITLAB') {
    const repo = normRepo(payload?.project?.path_with_namespace);
    if (!repo) return null;
    if (payload?.object_kind === 'push') {
      const commits: VcsCommit[] = (payload.commits ?? []).map((c: any) => ({
        id: c.id || '',
        message: c.message || '',
        url: c.url || null,
        author: c.author?.name || null,
      }));
      return {
        kind: 'push',
        repoFullName: repo,
        branch: (payload.ref || '').replace('refs/heads/', ''),
        commits,
      };
    }
    if (payload?.object_kind === 'merge_request') {
      const mr = payload.object_attributes || {};
      return {
        kind: 'pr',
        repoFullName: repo,
        pr: {
          number: mr.iid ?? 0,
          title: mr.title || '',
          body: mr.description ?? null,
          url: mr.url || null,
          author: payload.user?.username || payload.user?.name || null,
          merged: mr.state === 'merged',
          state: mr.state || 'opened',
        },
      };
    }
    return null;
  }

  if (provider === 'GITEE') {
    const repo = normRepo(payload?.repository?.full_name);
    if (!repo) return null;
    if (payload?.ref || payload?.commits) {
      const commits: VcsCommit[] = (payload.commits ?? []).map((c: any) => ({
        id: c.id || '',
        message: c.message || '',
        url: c.url || null,
        author: c.author?.name || null,
      }));
      return {
        kind: 'push',
        repoFullName: repo,
        branch: (payload.ref || '').replace('refs/heads/', ''),
        commits,
      };
    }
    if (payload?.pull_request) {
      const pr = payload.pull_request;
      return {
        kind: 'pr',
        repoFullName: repo,
        pr: {
          number: pr.number ?? 0,
          title: pr.title || '',
          body: pr.body ?? null,
          url: pr.html_url || null,
          author: pr.user?.login || pr.user?.name || null,
          merged: !!pr.merged || pr.state === 'merged',
          state: pr.merged ? 'merged' : (pr.state === 'closed' ? 'closed' : 'open'),
        },
      };
    }
    return null;
  }

  return null;
}

/** 平台专用验签：GitHub HMAC（X-Hub-Signature-256）；GitLab/Gitee 明文 token（X-Gitlab-Token / X-Gitee-Token） */
export function verifyVcsSignature(
  provider: VcsProvider,
  secret: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
  hmacVerify: (secret: string, rawBody: string, signature: string | undefined) => boolean,
): boolean {
  if (provider === 'GITHUB') {
    return hmacVerify(secret, rawBody, headers['x-hub-signature-256'] || headers['x-hub-signature']);
  }
  // GitLab / Gitee：Secret Token 明文比对
  const token = provider === 'GITLAB' ? headers['x-gitlab-token'] : headers['x-gitee-token'];
  if (!token || !secret) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && require('crypto').timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
