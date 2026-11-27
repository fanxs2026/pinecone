'use strict';
/**
 * 统一获取 pg 驱动。
 *
 * pnpm 的 hoisted 布局会把依赖放在 workspace 级（apps/backend/node_modules），
 * 但不同机器/CI 缓存状态下也可能落在根 node_modules。写死一条路径会在
 * CI 上直接 MODULE_NOT_FOUND，所以按优先级回退。
 */
const path = require('path');

function requirePg(ROOT) {
  const candidates = [
    path.join(ROOT, 'apps', 'backend', 'node_modules', 'pg'),
    path.join(ROOT, 'node_modules', 'pg'),
    'pg',
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try next */
    }
  }
  throw new Error('pg driver not found (looked in apps/backend/node_modules, root node_modules)');
}

module.exports = { requirePg };
