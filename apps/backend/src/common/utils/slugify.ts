/**
 * Convert text to a URL-friendly slug.
 * Supports Chinese characters (kept as-is in output).
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'untitled';
}
