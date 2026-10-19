/**
 * Slug 工具（前端）
 *
 * 背景：后端对不同资源的 slug 校验强度不一致 ——
 *   - `CreateSpaceDto.slug`（知识库空间）有 `@Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)`，只认小写字母/数字/连字符；
 *   - `CreateWorkspaceDto.slug`（工作区）只校验长度 2-50，允许空格与中文。
 * 因此「工作区 slug 直接透传给知识库空间 slug」会 400（例如工作区 slug 为 "CEDA Client"）。
 * 对外发送前必须净化，禁止直接透传。
 */

/**
 * 严格 ASCII slug：小写字母、数字、单个连字符。
 * 与后端 `/^[a-z0-9]+(-[a-z0-9]+)*$/` 对齐；无 ASCII 字母数字时返回 ''，
 * 调用方应改为省略该字段、由后端按 name 派生。
 */
export function slugifyAscii(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * 工作区 slug 输入框净化：保留 CJK（后端允许），
 * 把空格/非法字符折叠为连字符，避免产生 "CEDA Client" 这类脏数据。
 */
export function sanitizeSlugInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 50);
}
