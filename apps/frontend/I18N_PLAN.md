# Pinecone 前端多语言（i18n）改造方案评估报告

> 范围：前端 `apps/frontend`（Next.js 16 App Router + React 19 + React Query v5 + Tailwind v4 + Zustand）
> 目标语言：中文（默认 `zh`）＋ 英文（`en`），架构需可平滑扩展更多语言
> 产出性质：方案与范围界定，**不含最终业务代码**（配置脚手架与命名约定除外）

---

## 0. 结论先行（TL;DR）

1. **库选型：推荐 `next-intl`。** 它是目前唯一对 Next.js 16 App Router（RSC + 客户端组件混用）一等支持、且与 Next 官方路由/metadata 集成最干净的方案。`next-i18next` 本质是 Pages Router 产物，已不推荐；`react-i18next` 可用但要自建 provider / 路由桥接 / 服务端桥接，样板代码多，性价比低。
2. **路由策略：推荐「不带 URL 前缀」的 cookie 方案（`localePrefix: 'never'`）。** 本项目是登录后内部工具，SEO 无关；且现有代码里**大量硬编码路由字符串**（`router.push('/kb/...')`、`window.location.href='/login'`、`Link href="/"`），只要 URL 加 `/zh`、`/en` 前缀，这些全部要改、极易漏改。**cookie 方案下 URL 完全不变，这些路由零改动**——这是「小步快跑、改动最小」的关键。
3. **目录与消息文件：新建 `src/i18n/` + `src/messages/{zh,en}.json`，状态枚举标签集中到一个 `statuses` 命名空间**（目前散落在 `features` / `releases` / `kb` 三处 + 颜色文件）。
4. **第一阶段即可让老板看到效果**：只翻「两个布局（侧边栏 + KB 顶栏）+ 概览页 + 登录/注册 + 语言切换器」，用户点切换即可见 nav/落地页/认证变化。
5. **两个必须由老板拍板的决策点**：(a) URL 是否带 locale 前缀（我倾向不带）；(b) 后端 API 报错文案本期是否一并国际化（我建议本期只前端，后端 `.message` 暂保留中文）。

---

## 1. 代码探索发现（中文文案分布）

### 1.1 关键架构事实
- 根布局 `app/layout.tsx` 是 **Server Component**（无 `'use client'`），写死了 `<html lang="zh-CN">` 与中文 `metadata.title`。这是接入 i18n 的**唯一必需改动点**（动态 `lang` + `generateMetadata` + 包 `NextIntlClientProvider`）。
- `components/providers.tsx` 目前只包了 `QueryClientProvider`。i18n 的客户端 provider 要在这里（或根布局）叠加。
- **两个共享外壳（chrome）是优先级最高的文件**：
  - `(dashboard)/layout.tsx`（客户端组件）：左侧栏 `sidebarItems` 数组里硬编码中文标签（概览/支持请求/需求池/功能列表/发布计划/看板/工时/知识库），外加「选择工作区 / 暂无工作区 / 创建工作区 / 退出登录」。侧边栏底色 `#eef1f5`（Aha! muted pastel）已符合视觉规范。
  - `(kb)/layout.tsx`（客户端组件）：KB 顶栏「知识库」「搜索页面标题...」「无匹配页面」「回到首页」，以及状态枚举内联显示 `'草稿' : '已发布'`。
- **状态枚举标签目前散落 4 处**，是最大的一致性与重复风险：
  - `features/[id]/page.tsx`：`FEATURE_STATUSES`（开放/待梳理/拆解中/开发中/验证中/已完成）
  - `releases/page.tsx`：`statusLabel`（未开始/执行中/已关闭）
  - `kb` 相关：`'草稿' : '已发布'`、`page-tree.tsx` 的「草稿」
  - `lib/status-colors.ts`：**20 行中文全是注释，无 UI 字符串**，但注释里记录了状态语义，可籍此整理出完整枚举清单。

### 1.2 待改造文件清单（按模块分组，CJK 行数为工作量代理指标）

| 模块 | 文件 | 含中文行数(代理) | 体量 | 拟排期 |
|---|---|---|---|---|
| **框架/外壳** | `app/layout.tsx`（根：lang+metadata） | 2 | S | P0/P1 |
| | `(dashboard)/layout.tsx`（侧边栏） | 12 | M | P1 |
| | `(kb)/layout.tsx`（KB 顶栏） | 5 | S | P1 |
| | `components/providers.tsx`（包 provider） | 0(需改) | S | P0 |
| **认证/入口** | `(auth)/login/page.tsx` | 7 | S | P1 |
| | `(auth)/register/page.tsx` | 15 | M | P1 |
| | `(dashboard)/page.tsx`（概览/引导） | 27 | M | P1 |
| **Dashboard 列表+详情** | `(dashboard)/features/page.tsx` | 16 | M | P2 |
| | `(dashboard)/features/[id]/page.tsx` | 42 | **L** | P2 |
| | `(dashboard)/features/feature-card.tsx` | 7 | S | P2 |
| | `(dashboard)/ideas/page.tsx` | 23 | M | P2 |
| | `(dashboard)/ideas/[id]/page.tsx` | 37 | L | P2 |
| | `(dashboard)/releases/page.tsx` | 33 | L | P2 |
| | `(dashboard)/supports/page.tsx` | 16 | M | P2 |
| | `(dashboard)/supports/[id]/page.tsx` | 30 | L | P2 |
| | `(dashboard)/stories/page.tsx` | 19 | M | P2 |
| | `(dashboard)/stories/[id]/page.tsx` | **59** | **XL** | P2 |
| | `(dashboard)/stories/story-card.tsx` | 5 | S | P2 |
| | `(dashboard)/stories/kanban-column.tsx` | 2 | S | P2 |
| | `(dashboard)/time-tracking/page.tsx` | 14 | M | P2 |
| **知识库 KB** | `(kb)/kb/page.tsx` | 5 | S | P3 |
| | `(kb)/kb/[spaceId]/page.tsx` | 8 | S | P3 |
| | `(kb)/kb/[spaceId]/new/page.tsx` | 7 | S | P3 |
| | `(kb)/kb/[spaceId]/[pageId]/page.tsx` | 20 | M | P3 |
| | `components/kb/page-tree.tsx`（目录树/可见性） | 9 | S | P3 |
| | `components/kb/tiptap-editor.tsx`（编辑器工具栏 tooltip） | 30 | L | P3 |
| **共享组件** | `components/comment-section.tsx` | 5 | S | P2 |
| | `components/file-upload.tsx` | 2 | S | P2 |
| | `components/history-timeline.tsx`（动态拼接最多） | 17 | M | P2 |
| | `components/relations-panel.tsx` | 20 | M | P2 |
| | `components/tag-input.tsx` | 1 | S | P2 |
| | `components/log-work-dialog.tsx` | 8 | S | P2 |
| **Lib（仅需梳理，无需逐字翻译）** | `lib/status-colors.ts` | 20(注释) | — | P2(集中枚举) |
| | `lib/date-utils.ts`（硬编码 `YYYY-MM-DD HH:mm:ss`，非 locale-aware） | 0 | — | P4(格式化) |

**总量估计**：约 **500 行含中文，分布在 32 个文件**（另 `status-colors.ts` 的 20 行是注释）。去重合并后，独立 UI 文案条数约 **350–450 条**。这是一次性翻译资产，建议先建 `zh.json`（现有中文 1:1 拷贝）+ `en.json`（翻译），后续只增量维护。

### 1.3 已存在的「中英混排」问题（i18n 顺手治理）
- `releases/page.tsx`：标签「Stage」「Prod」「Production 发布日期」已是英文残留。
- `features/[id]/page.tsx`：按钮文案 `"Clone to Story"` 为英文，其余中文。
- 这些应在 i18n 时统一收口，避免英文用户看到半中半英。

---

## 2. 技术方案推荐

### 2.1 候选方案对比

| 方案 | App Router 支持 | RSC/客户端混用 | 与现有路由组兼容 | 样板量 | 结论 |
|---|---|---|---|---|---|
| **next-intl** | ✅ 一等支持（官方推荐） | ✅ `getTranslations`(RSC) + `useTranslations`(客户端) | ✅ 原生兼容 `(kb)/(dashboard)` 路由组 | 低 | **推荐** |
| next-i18next | ❌ 面向 Pages Router | ⚠️ 需 workaround | ⚠️ 与 App Router 不自然 | 中 | 不推荐 |
| react-i18next + 自建 provider | ✅（但要自己搭） | ✅（自己接） | ⚠️ 路由/服务端桥接全要手写 | 高 | 性价比低，除非已有强依赖 |

**为什么是 next-intl**：
- 官方对 App Router 的完整支持：`defineRouting` + `createMiddleware`（基于 `middleware.ts`，Next 16 已**移除**内置 `i18n` 配置项，必须用 middleware 方案）+ `getRequestConfig` + `NextIntlClientProvider`。
- 与 React Query **正交无冲突**（RQ 管数据、next-intl 管 UI 字符串），且 query key 与 locale 无关，缓存不受影响。
- 原生 `ICU MessageFormat`（`{name}`、`{from}`/`{to}` 插值、`{count, plural}`），直接解决本项目的动态拼接问题。
- 原生 `useFormatter` 封装 `Intl.DateTimeFormat` / `Intl.NumberFormat`，直接解决 `date-utils.ts` 的 locale 格式化风险。

### 2.2 路由策略（关键决策）

**推荐：`localePrefix: 'never'`（cookie 方案，URL 不变）**

理由（结合本项目实际代码）：
- 现有大量**硬编码路由字符串**需保护：
  - `(kb)/layout.tsx`：`router.push('/kb/${spaceId}/${pageId}')`
  - `(kb)/page-tree.tsx`：`router.push('/kb/${spaceId}/${id}')`
  - `(dashboard)/layout.tsx`：`window.location.href = '/login'`、`Link href="/?create-ws=1"`
  - 多个 `router.push('/releases/...')` 等
  - 一旦 URL 加 `/zh`、`/en` 前缀，以上**每一处都会断**，且排查成本高。
- cookie 方案下：中间件从 `NEXT_LOCALE` cookie 读取语言，URL 完全不动，上述代码**零改动**。
- 代价：失去「按 URL 分享特定语言」能力——对登录后内部工具完全可接受。

**备选（若未来要分享链接）**：`localePrefix: 'as-needed'`（默认语言无前缀 `/kb`，其他语言 `/en/kb`）。届时上面的硬编码路由会默认产出默认语言链接，非默认语言需用 next-intl 的 `Link`/`useRouter` 包装——因此若选此项，硬编码路由仍需逐步替换。

> ✅ **决策点 1（老板拍板）**：URL 是否带 locale 前缀？我建议**不带**（cookie 方案），改动最小、风险最低。

### 2.3 目录结构与命名约定（脚手架示意，非业务代码）

```
apps/frontend/src/
├─ i18n/
│  ├─ routing.ts        # defineRouting({ locales:['zh','en'], defaultLocale:'zh' })
│  ├─ request.ts        # getRequestConfig：按 cookie 读 locale，加载 messages
│  └─ navigation.ts     # createNavigation：本地化 Link/redirect/usePathname/useRouter
├─ middleware.ts         # createMiddleware({ localePrefix:'never' })
├─ messages/
│  ├─ zh.json           # 默认语言，现有中文 1:1 拷贝
│  └─ en.json           # 翻译
└─ app/
   ├─ layout.tsx        # 包 NextIntlClientProvider，动态 <html lang>
   ├─ (dashboard)/...
   └─ (kb)/...
```

`messages/zh.json` 命名空间示意（集中状态枚举，消除散落）：
```jsonc
{
  "nav":      { "overview":"概览", "supports":"支持请求", "ideas":"需求池",
                "features":"功能列表", "releases":"发布计划", "stories":"看板",
                "timeTracking":"工时", "kb":"知识库" },
  "common":   { "save":"保存", "cancel":"取消", "create":"创建", "edit":"编辑",
                "search":"搜索", "loading":"加载中…", "noData":"暂无数据" },
  "statuses": {
    "feature": { "OPEN":"开放", "READY_FOR_GROOMING":"待梳理", "DECOMPOSITION":"拆解中",
                  "IN_DEVELOPING":"开发中", "IN_VERIFICATION":"验证中", "CLOSED":"已完成" },
    "release": { "PLANNING":"未开始", "IN_PROGRESS":"执行中", "CLOSED":"已关闭" },
    "idea":    { "OPEN":"开放", "IN_REVIEW":"评审中", "PLANNED":"已规划",
                  "SHIPPED":"已发布", "REJECTED":"已拒绝", "DUPLICATED":"已重复", "DRAFT":"草稿" },
    "story":   { "TODO":"待办", "IN_PROGRESS":"进行中", "REVIEW":"评审", "DONE":"完成", "BLOCKED":"阻塞" },
    "kb":      { "draft":"草稿", "published":"已发布" }
  },
  "history":  { "created":"创建", "updated":"更新", "statusChanged":"状态变更", "deleted":"删除",
                "createdEntry":"创建了此条目", "statusFromTo":"状态从 “{from}” 变更为 “{to}”" },
  "editor":   { "heading1":"标题1", "bold":"加粗", "italic":"斜体", /* …30 个工具栏 tooltip… */ }
}
```
`en.json` 同结构、同 key、英文值。翻译时注意 `history.statusFromTo` 这类带 `{from}`/`{to}` 插值的条目，英文语序可能不同（用 ICU 占位符即可自由排序）。

### 2.4 与 React Query 的协作
- 二者职责不重叠：RQ 取后端数据（数据本身不应含 UI 文案），next-intl 渲染 UI 文案。
- 唯一交叉点：后端错误 `.message`（如 `createWs.error?.response?.data?.message`）目前会直接展示。这类文案由后端（NestJS/Prisma）产生，**本期前端 i18n 不覆盖**（见决策点 2）。前端兜底字符串（如 `'创建失败，请重试'`）属于前端，需翻译。

---

## 3. 改造范围、优先级与分阶段计划

### 3.1 语言切换器（Locale Switcher）
- **位置**：两个共享外壳各放一个共享 `<LocaleSwitcher />`
  - `(dashboard)` 侧边栏：**用户区（底部头像旁）或侧边栏头部 logo 旁**，推荐底部用户区，离「退出登录」近、符合 Aha! 风格。
  - `(kb)` 顶栏：**右侧「回到首页」左侧**，与顶栏操作区一致。
- **交互**：极简 `中文 | EN` 切换（或下拉）。cookie 方案下点击即 `document.cookie='NEXT_LOCALE=en'` + `router.refresh()`，无需跳路由、无闪烁、状态保留。
- **默认与回退**：首访默认 `zh`；cookie 缺失/非法值回退 `zh`。语言偏好走 cookie，**不进 Zustand store**（避免 hydration 不一致）。

### 3.2 分阶段实施（小步快跑，每阶段可独立验证）

**Phase 0 — 框架骨架（约 0.5–1 天，用户手动执行 `pnpm add next-intl`）**
- 新建 `i18n/routing.ts`、`i18n/request.ts`、`i18n/navigation.ts`、`middleware.ts`。
- 新建 `messages/zh.json`（现有中文 1:1 拷贝）、`en.json`（翻译）。
- 根 `layout.tsx`：包 `NextIntlClientProvider`、动态 `<html lang={locale}>`、`generateMetadata` 用 `getTranslations`。
- 此阶段不翻译任何业务文案，仅为骨架；`zh.json` 内容为当前中文，用户无感。

**Phase 1 — 立即可见效果（约 1–2 天）⭐ 让老板立刻看到**
- 翻译两个外壳：`(dashboard)/layout.tsx`（侧边栏 8 个导航标签 + 工作区切换文案）、`(kb)/layout.tsx`（顶栏 + 搜索 + 状态）。
- 翻译 `app/layout.tsx` 的 `metadata` 标题。
- 翻译 `(auth)/login`、`(auth)/register`、`(dashboard)/page.tsx`（概览/引导）。
- 植入 `<LocaleSwitcher />`。
- **交付物**：用户进首页 → 点切换 → 导航栏 / 概览 / 登录注册 立即变中英文。视觉无回归（侧边栏仍 `#eef1f5`）。

**Phase 2 — Dashboard 模块 + 共享组件（约 2–3 天）**
- 列表页：`features` / `ideas` / `supports` / `releases` / `stories` / `time-tracking` 及其详情页 `[id]`。
- **集中状态枚举**：把 `features`/`releases`/`kb` 散落的状态标签统一到 `messages.statuses.*`，各详情页改用 `t('statuses.feature.OPEN')` 等。
- 共享组件：`comment-section`、`history-timeline`（含 `{from}/{to}` 插值）、`relations-panel`、`log-work-dialog`、`file-upload`、`tag-input`。
- 顺手治理中英混排（Stage/Prod/Clone to Story → 统一 key）。

**Phase 3 — 知识库 KB 模块（约 1–2 天）**
- `kb` 各页面、`page-tree.tsx`（目录树/可见性标签）、`tiptap-editor.tsx`（30 个工具栏 tooltip + placeholder）。
- Tiptap 工具栏 `title` 属性逐一接 `t('editor.xxx')`（推荐放 messages，而非 Tiptap 自带 i18n，保持单一来源）。

**Phase 4 — 格式化与打磨（约 1 天）**
- 日期/数字：`lib/date-utils.ts` 改为 locale-aware——用 next-intl `useFormatter().dateTime(...)` / `.number(...)`，或在该文件内读 `getLocale()` 后用 `Intl`。删除手写 `YYYY-MM-DD HH:mm:ss` 拼接。
- 空态/错误态一致性、英文文案母语级润色、枚举完整性核对（与后端对照，见决策点 3）。

---

## 4. 关键风险与决策点

### 4.1 风险登记表

| # | 风险 | 位置 | 严重度 | 缓解 |
|---|---|---|---|---|
| R1 | 硬编码路由字符串在「带前缀」方案下大面积断裂 | `(kb)/layout`、`page-tree`、`(dashboard)/layout` 等 | 🔴(仅带前缀时) | 采用 cookie 方案（无前缀）→ 路由零改动 |
| R2 | 状态枚举标签散落 4 处，翻译易重复/不一致 | `features/[id]`、`releases`、`kb`、`status-colors.ts` | 🔴 | 集中到 `messages.statuses.*` 单一来源 |
| R3 | 动态拼接字符串（`欢迎回来${name}`、`状态从"${from}"变更为"${to}"`） | `dashboard/page`、`history-timeline` | 🟡 | 用 ICU `{name}`/`{from}`/`{to}` 插值 |
| R4 | 日期/数字硬编码格式、非 locale-aware | `lib/date-utils.ts` | 🟡 | 改用 next-intl `format.dateTime/number` |
| R5 | 第三方编辑器工具栏 30 个 tooltip 需逐条接 t() | `tiptap-editor.tsx` | 🟡 | 全部收进 `messages.editor.*` |
| R6 | 中英混排已存在（Stage/Prod/Clone to Story） | `releases`、`features/[id]` | 🟢 | i18n 同时治理，统一 key |
| R7 | 根 `metadata` 写死中文 | `app/layout.tsx` | 🟢 | `generateMetadata` + `getTranslations` |
| R8 | RSC/客户端桥接：根布局是 Server Component，需把 messages 传给客户端 | 全组件 | 🟡 | 根布局 `getMessages()` → `NextIntlClientProvider`；客户端组件 `useTranslations` |
| R9 | 语言偏好持久化与 hydration | 切换器/store | 🟢 | 走 `NEXT_LOCALE` cookie，不进 Zustand |
| R10 | 后端 API 报错 `.message` 仍是中文 | 各 mutation 的 error 兜底 | 🟡 | 本期前端不覆盖（决策点 2）；前端兜底串翻译 |

### 4.2 需老板拍板的决策点

1. **URL 是否带 locale 前缀？** → 建议**不带**（`localePrefix:'never'`，cookie 方案），改动最小、风险最低；备选 `as-needed`（默认语言无前缀、en 有前缀）。
2. **后端 API 报错文案是否本期一并国际化？** → 建议**本期只做前端**；后端 NestJS 返回的 `.message` 仍中文（后续可单独做，但不在本期范围）。
3. **状态枚举集合是否完整？** → 前端可见的 `feature/release/idea/story/kb` 枚举我已从代码+注释整理，但**建议与后端 Prisma schema 对照一次**，避免漏掉后端独有状态（如 idea 的 `ALREADY_EXISTING` 等），一次性进 `statuses`。
4. **新增语言的成本？** → 当前架构 `locales:['zh','en']` 已可扩展；加语言只需新增 `messages/xx.json` + 在 routing 注册，无需改组件。是否本期预留更多语言键位命名（如 `zh-CN`/`en-US`）？建议先用 `zh`/`en` 短码，后续再升级。
5. **字体**：当前 `Inter` 仅 `latin` 子集，中文走系统回退（已可用）。英文用户是否需要更合适字体？建议保持现状，后续优化。

---

## 5. 下一步（需用户手动执行的命令）

> 本会话 AI 不能执行 shell。以下交给用户/CI 跑：

```bash
# 在 apps/frontend 目录
pnpm add next-intl
pnpm dev      # 改完分阶段验证
pnpm typecheck
```

- Phase 0 产出配置文件 + 两个 `messages/*.json` 后，建议先 `pnpm dev` 自测「切换器出现、刷新后语言记忆」。
- 之后每个 Phase 结束都让老板看一次效果（小步快跑）。

---
*报告完。核心结论：next-intl + cookie 无前缀方案 + 状态枚举集中，Phase 1 即可让老板看到中英文切换效果。*
