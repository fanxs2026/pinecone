import type { SVGProps } from 'react';

// Confluence-style table operation icons (v6).
// Design rules (matched exactly to user's reference screenshots):
//   - Row icons use "日" (2-row grid), 14 wide × 10 tall (left-right stretched for better proportion)
//   - Column icons use "目" (2-col grid), 8 wide × 14 tall
//   - Single row / single col icons for delete operations (no internal divider)
//   - "+" mark: equal-length cross, color #0747a6 (blue), placed at table corner
//   - Uniform 2-unit gap between "+" mark and table (1 unit in 20x20 viewBox ≈ 0.8px @ 16x16 — visible)
//   - Diagonal slash: from (18,2) to (2,18), color #172b4d
//   - Table grid color: #172b4d (deep slate blue)
// All icons render on 20x20 viewBox, designed at 16x16 display size.

type IconProps = SVGProps<SVGSVGElement>;

const stroke = '#172b4d';
const plusStroke = '#0747a6';
const sw = 2;          // 表格描边
const swPlus = 2;      // 加号（与表格一致）
const swSlash = 2;     // 斜线

// ---------- 6 个表格操作图标（v6：加号加粗到 2 + 统一 2 单位空隙） ----------

/** 上加行：14x10 表格 + 加号嵌在表格左上角（2 单位空隙） */
export function AddRowAboveIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* 加号：y=2..6 中心 y=4，表格 y=8 → 距离 2 单位 */}
      <g stroke={plusStroke} strokeWidth={swPlus}>
        <line x1="1" y1="4" x2="5" y2="4" />
        <line x1="3" y1="2" x2="3" y2="6" />
      </g>
      {/* 14x10 表格 */}
      <g stroke={stroke} strokeWidth={sw}>
        <rect x="3" y="8" width="14" height="10" />
        <line x1="3" y1="13" x2="17" y2="13" />
      </g>
    </svg>
  );
}

/** 下加行：14x10 表格 + 加号嵌在表格左下角（2 单位空隙） */
export function AddRowBelowIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        <rect x="3" y="2" width="14" height="10" />
        <line x1="3" y1="7" x2="17" y2="7" />
      </g>
      {/* 加号：y=14..18 中心 y=16，表格 y=12 → 距离 2 单位 */}
      <g stroke={plusStroke} strokeWidth={swPlus}>
        <line x1="1" y1="16" x2="5" y2="16" />
        <line x1="3" y1="14" x2="3" y2="18" />
      </g>
    </svg>
  );
}

/** 删除行：只画一行表格（无横线分割）+ 斜线（左上→右下） */
export function DeleteRowIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        {/* 单行表格（拉宽 14x6） */}
        <rect x="3" y="7" width="14" height="6" />
        {/* 斜线统一方向：左上→右下（\） */}
        <line x1="2" y1="2" x2="18" y2="18" strokeWidth={swSlash} />
      </g>
    </svg>
  );
}

/** 左加列：8x14 表格 + 加号嵌在表格左上角（2 单位空隙） */
export function AddColumnLeftIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* 加号：x=1..5 中心 x=3，表格 x=7 → 距离 2 单位 */}
      <g stroke={plusStroke} strokeWidth={swPlus}>
        <line x1="1" y1="3" x2="5" y2="3" />
        <line x1="3" y1="1" x2="3" y2="5" />
      </g>
      <g stroke={stroke} strokeWidth={sw}>
        <rect x="7" y="3" width="8" height="14" />
        <line x1="11" y1="3" x2="11" y2="17" />
      </g>
    </svg>
  );
}

/** 右加列：8x14 表格 + 加号嵌在表格右上角（2 单位空隙） */
export function AddColumnRightIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* 加号：x=15..19 中心 x=17，表格 x=13 → 距离 2 单位 */}
      <g stroke={plusStroke} strokeWidth={swPlus}>
        <line x1="15" y1="3" x2="19" y2="3" />
        <line x1="17" y1="1" x2="17" y2="5" />
      </g>
      <g stroke={stroke} strokeWidth={sw}>
        <rect x="5" y="3" width="8" height="14" />
        <line x1="9" y1="3" x2="9" y2="17" />
      </g>
    </svg>
  );
}

/** 删除列：只画一列（4x14，居中）+ 斜线（左上→右下） */
export function DeleteColumnIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        {/* 单列表格（左右窄 4x14，居中） */}
        <rect x="8" y="3" width="4" height="14" />
        {/* 斜线统一方向：左上→右下（\） */}
        <line x1="2" y1="2" x2="18" y2="18" strokeWidth={swSlash} />
      </g>
    </svg>
  );
}

/** 删除表格：3 行 2 列表格 + 斜线（左上→右下） */
export function DeleteTableIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        {/* 3 行 2 列：14x14 表格 */}
        <rect x="3" y="3" width="14" height="14" />
        <line x1="10" y1="3" x2="10" y2="17" />          {/* 中间竖线（2 列） */}
        <line x1="3" y1="7.67" x2="17" y2="7.67" />      {/* 上横线（3 行） */}
        <line x1="3" y1="12.33" x2="17" y2="12.33" />    {/* 中横线 */}
        {/* 斜线统一方向：左上→右下（\） */}
        <line x1="2" y1="2" x2="18" y2="18" strokeWidth={swSlash} />
      </g>
    </svg>
  );
}

/** 设置标题行：3 行 2 列表格，第一行（2 格）涂成实心深色，下方 4 格白色 */
export function ToggleHeaderRowIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* 表格外框（描边） */}
      <g stroke={stroke} strokeWidth={sw}>
        <rect x="3" y="3" width="14" height="14" />
        <line x1="10" y1="3" x2="10" y2="17" />
        <line x1="3" y1="7.67" x2="17" y2="7.67" />
        <line x1="3" y1="12.33" x2="17" y2="12.33" />
      </g>
      {/* 第一行（标题行）：2 格实心深色填充 */}
      <g fill={stroke}>
        <rect x="3" y="3" width="7" height="4.67" />
        <rect x="10" y="3" width="7" height="4.67" />
      </g>
    </svg>
  );
}

/** 设置标题列：3 行 2 列表格，左边一列（3 格）涂成实心深色，右边 3 格白色 */
export function ToggleHeaderColumnIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* 表格外框（描边） */}
      <g stroke={stroke} strokeWidth={sw}>
        <rect x="3" y="3" width="14" height="14" />
        <line x1="10" y1="3" x2="10" y2="17" />
        <line x1="3" y1="7.67" x2="17" y2="7.67" />
        <line x1="3" y1="12.33" x2="17" y2="12.33" />
      </g>
      {/* 左列（标题列）：3 格实心深色填充 */}
      <g fill={stroke}>
        <rect x="3" y="3" width="7" height="4.67" />
        <rect x="3" y="7.67" width="7" height="4.66" />
        <rect x="3" y="12.33" width="7" height="4.67" />
      </g>
    </svg>
  );
}

/** 合并单元格：3 行 2 列表格，中间行 2 格合并为一个长条（中间行不画竖线） */
export function MergeCellsIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        {/* 完整外框 */}
        <rect x="3" y="3" width="14" height="14" />
        {/* 两条贯穿横线（分 3 行） */}
        <line x1="3" y1="7.67" x2="17" y2="7.67" />
        <line x1="3" y1="12.33" x2="17" y2="12.33" />
        {/* 中间行的竖线不画（合并）→ 顶行/底行各画一条短竖线 */}
        <line x1="10" y1="3" x2="10" y2="7.67" />
        <line x1="10" y1="12.33" x2="10" y2="17" />
      </g>
    </svg>
  );
}

/** 拆分单元格：3 行 2 列表格，中间行拆成 4 个小方块（v8 第一版） */
export function SplitCellIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        {/* 完整外框 */}
        <rect x="3" y="3" width="14" height="14" />
        {/* 两条贯穿横线（分 3 行） */}
        <line x1="3" y1="7.67" x2="17" y2="7.67" />
        <line x1="3" y1="12.33" x2="17" y2="12.33" />
        {/* 顶行/底行的短竖线（x=10） */}
        <line x1="10" y1="3" x2="10" y2="7.67" />
        <line x1="10" y1="12.33" x2="10" y2="17" />
        {/* 中间行加 2 条短竖线 → 把中间行分成 4 个小方块 */}
        <line x1="6.5" y1="7.67" x2="6.5" y2="12.33" />
        <line x1="13.5" y1="7.67" x2="13.5" y2="12.33" />
      </g>
    </svg>
  );
}

/** 单元格内 上对齐：3 条不同长度横线全部靠顶部 */
export function CellAlignTopIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        <line x1="3" y1="4" x2="17" y2="4" />
        <line x1="3" y1="7" x2="14" y2="7" />
        <line x1="3" y1="10" x2="11" y2="10" />
      </g>
    </svg>
  );
}

/** 单元格内 居中对齐：3 条不同长度横线全部在垂直方向居中 */
export function CellAlignMiddleIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        <line x1="3" y1="7" x2="17" y2="7" />
        <line x1="3" y1="10" x2="14" y2="10" />
        <line x1="3" y1="13" x2="11" y2="13" />
      </g>
    </svg>
  );
}

/** 单元格内 下对齐：3 条不同长度横线全部靠底部 */
export function CellAlignBottomIcon(props: IconProps) {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <g stroke={stroke} strokeWidth={sw}>
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="13" x2="14" y2="13" />
        <line x1="3" y1="16" x2="11" y2="16" />
      </g>
    </svg>
  );
}
