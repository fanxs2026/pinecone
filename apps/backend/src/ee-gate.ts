/**
 * 企业版模块加载门控（Open Core 边界）。
 *
 * 设计原则：
 * - 社区版（默认，PINE_EDITION !== 'enterprise'）：返回空数组，主仓库编译产物
 *   不含任何企业模块，企业功能实现完全不在公开仓库。
 * - 企业版：通过 `@ee/*` 别名（tsconfig paths 指向本地 overlay 目录）动态加载
 *   企业模块实现。社区构建不引用 `@ee/*`，故编译零依赖、零泄露。
 *
 * 使用动态 `import(variable)`（而非字面量 `import('@ee/...')`）以绕开 TypeScript
 * 对模块存在性的静态检查——社区版构建时 overlay 目录不存在，字面量路径会触发
 * TS2307；变量路径下 TS 仅校验类型，运行时由 enterprise 构建链解析真实 overlay 文件。
 *
 * NestJS 的 `@Module({ imports: [...] })` 支持数组元素为 `Promise<Type | DynamicModule>`，
 * 因此这里返回的动态 import Promise 数组可直接展开进 AppModule.imports。
 */

import { getPineEdition } from './common/config/edition';

/** 企业版模块路径列表（仅在 enterprise 构建下求值，社区版不引用） */
const EE_MODULE_PATHS: string[] = [
  '@ee/license/license.module',
  '@ee/sso/sso.module',
  '@ee/scim/scim.module',
  '@ee/audit/audit.module',
  '@ee/github/github.module',
  '@ee/webhooks/webhooks.module',
  '@ee/webhook-inbound/webhook-inbound.module',
  '@ee/ci/ci.module',
  '@ee/api-tokens/api-tokens.module',
  '@ee/teams/teams.module',
  '@ee/trash/trash.module',
  '@ee/ai/ai.module',
  '@ee/okr/okr.module',
];

/** 返回 AppModule 应导入的企业模块列表（社区版为空数组） */
export function getEnterpriseModules(): Array<Promise<any>> {
  if (getPineEdition() !== 'enterprise') return [];
  return EE_MODULE_PATHS.map((p) => import(/* @vite-ignore */ p).then((m: any) => m.default ?? m));
}
