import { create } from 'zustand';

/**
 * 版本信息 store（社区版 / 企业版）。
 *
 * 数据来自后端公开接口 GET /api/bootstrap（无需登录）：
 *   { edition: 'community' | 'enterprise', enterpriseFeatures: ['sso', ...] }
 *
 * 前端只做「可见性」过滤（菜单/入口/页签隐藏）——真正的安全防线是
 * 后端 @EnterpriseFeature 403 拦截。社区版部署下企业功能完全不可见。
 */
export type PineEdition = 'community' | 'enterprise';

interface EditionState {
  edition: PineEdition;
  enterpriseFeatures: string[];
  loaded: boolean;
  loadBootstrap: () => Promise<void>;
}

export const useEditionStore = create<EditionState>()((set) => ({
  edition: 'community',
  enterpriseFeatures: [],
  loaded: false,
  loadBootstrap: async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || '/api';
      const r = await fetch(`${base}/bootstrap`, { cache: 'no-store' });
      if (!r.ok) return; // bootstrap 失败 → 保持 community（fail-closed，不显示企业功能）
      const data = await r.json();
      set({
        edition: data.edition === 'enterprise' ? 'enterprise' : 'community',
        enterpriseFeatures: Array.isArray(data.enterpriseFeatures) ? data.enterpriseFeatures : [],
        loaded: true,
      });
    } catch {
      // 网络失败 → 保持 community（fail-closed）
    }
  },
}));

/** 判断某企业功能是否对本部署可用（社区版一律 false） */
export function useEnterpriseFeature(feature: string): boolean {
  return useEditionStore.getState().edition === 'enterprise';
}
