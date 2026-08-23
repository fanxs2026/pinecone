/**
 * CSV 导入值映射（方向1-②）。
 * 把 CSV 中的业务值（中文/缩写/枚举）归一化到 Pinecone 内部枚举。
 * 前端映射向导可传自定义 valueMap 覆盖；未覆盖的走这里的内置默认映射。
 */

export function mapValue(field: string, raw: string): string {
  const v = raw.trim();
  if (!v) return v;

  switch (field) {
    case 'priority': {
      // 高/紧急/1 → P0；中/2 → P1；低/3 → P2；4/一般 → P3
      if (/^(高|紧急|urgent|critical|1|p0)$/i.test(v)) return 'P0';
      if (/^(中|normal|medium|2|p1)$/i.test(v)) return 'P1';
      if (/^(低|low|3|p2)$/i.test(v)) return 'P2';
      if (/^(4|p3|一般|minor)$/i.test(v)) return 'P3';
      return v.toUpperCase().startsWith('P') ? v.toUpperCase() : v;
    }
    case 'status': {
      // 通用状态映射（Idea/Support/TestCase 各自允许值不同，取命中值原样返回）
      const map: Record<string, string> = {
        open: 'OPEN', 打开: 'OPEN', 开启: 'OPEN', 新: 'OPEN', 新建: 'OPEN', 待处理: 'OPEN',
        in_review: 'IN_REVIEW', 处理中: 'IN_REVIEW', 评审中: 'IN_REVIEW', 进行中: 'IN_REVIEW',
        closed: 'CLOSED', 关闭: 'CLOSED', 已关闭: 'CLOSED', 完成: 'CLOSED', done: 'DONE',
        planned: 'PLANNED', 已计划: 'PLANNED', 计划中: 'PLANNED',
        shipped: 'SHIPPED', 已发布: 'SHIPPED', 已上线: 'SHIPPED',
        rejected: 'REJECTED', 已拒绝: 'REJECTED', 拒绝: 'REJECTED',
        todo: 'TODO', 待办: 'TODO',
        in_progress: 'IN_PROGRESS', 开发中: 'IN_PROGRESS',
        review: 'REVIEW', 测试中: 'REVIEW', 待测试: 'REVIEW',
        blocked: 'BLOCKED', 阻塞: 'BLOCKED',
        duplicated: 'DUPLICATED', 重复: 'DUPLICATED', 已重复: 'DUPLICATED',
        already_existing: 'ALREADY_EXISTING', 已存在: 'ALREADY_EXISTING',
        draft: 'DRAFT', 草稿: 'DRAFT',
      };
      const key = v.toLowerCase().replace(/\s+/g, '_');
      return map[key] ?? v.toUpperCase();
    }
    case 'type': {
      // Support/TestCase 的类型映射（Bug 缺陷 → DEFECT 是重点）
      if (/^(bug|缺陷|故障|defect|bug修复)$/i.test(v)) return 'DEFECT';
      if (/^(功能|feature|需求)$/i.test(v)) return 'FEATURE';
      if (/^(性能|performance)$/i.test(v)) return 'PERFORMANCE';
      if (/^(安全|security)$/i.test(v)) return 'SECURITY';
      if (/^(接口|api|api测试)$/i.test(v)) return 'API';
      if (/^(支持|support|support_request|咨询)$/i.test(v)) return 'SUPPORT_REQUEST';
      return v.toUpperCase().replace(/-/g, '_');
    }
    case 'category': {
      if (/^(功能|feature|新功能)$/i.test(v)) return 'FEATURE';
      if (/^(缺陷|bug|问题)$/i.test(v)) return 'DEFECT';
      if (/^(优化|improvement|enhancement)$/i.test(v)) return 'IMPROVEMENT';
      if (/^(其他|other)$/i.test(v)) return 'OTHER';
      return v.toUpperCase().replace(/-/g, '_');
    }
    default:
      return v;
  }
}
