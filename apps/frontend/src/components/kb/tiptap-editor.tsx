'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Palette, Highlighter,
  List, ListOrdered, ListChecks,
  AlignLeft, AlignCenter, AlignRight,
  Outdent, Indent,
  Undo2, Redo2,
  Link2, Link2Off, ImageIcon, Table as TableIcon,
  PaintBucket,
} from 'lucide-react';
import {
  AddRowAboveIcon, AddRowBelowIcon, DeleteRowIcon,
  AddColumnLeftIcon, AddColumnRightIcon, DeleteColumnIcon,
  DeleteTableIcon,
  ToggleHeaderRowIcon, ToggleHeaderColumnIcon,
  MergeCellsIcon, SplitCellIcon,
  CellAlignTopIcon, CellAlignMiddleIcon, CellAlignBottomIcon,
} from './editor-icons';

interface TiptapEditorProps {
  content?: any;
  onChange?: (json: any, text: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  /** 输出格式：'json'（KB 默认）| 'html'（评论富文本） */
  outputFormat?: 'json' | 'html';
  /** G1 P2-C 实时协同：传入则启用 Yjs（wss://HOST:3002/kb-collab?docName=<pageId>；鉴权走 httpOnly cookie） */
  collab?: { pageId: string; token?: string };
}

const FONT_COLORS = ['#000000','#434343','#666666','#999999','#b7b7b7','#cccccc',
  '#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff'];
const BG_COLORS = ['transparent','#fff475','#fbbc04','#f28b82','#ffab40',
  '#a8dab5','#c2e7ff','#d3e3fd','#d7aefb','#f8cee0',
  '#e6e6e6','#cccccc'];

/**
 * 自定义命令：toggle 光标所在行/列为表格标题行/列。
 * 不依赖 Tiptap 内置 toggleHeaderRow/Column（实测只处理第一行/列），
 * 通过遍历祖先找光标所在的 row 节点，再手动把 cells 替换为 TableHeader/TableCell。
 */
function toggleHeaderAtCursor(
  editor: Editor,
  type: 'row' | 'column',
): void {
  if (!editor.isActive('table')) return;

  const { state, view } = editor;
  const { schema } = state;
  const $from = state.selection.$from;

  if (type === 'row') {
    // 找光标所在 row 节点
    let rowDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'tableRow') {
        rowDepth = d;
        break;
      }
    }
    if (rowDepth === -1) return;

    const rowPos = $from.before(rowDepth);
    const rowNode = $from.node(rowDepth);
    const firstCellType = rowNode.firstChild?.type.name;
    const isCurrentlyHeader = firstCellType === 'tableHeader';
    const targetType = isCurrentlyHeader ? schema.nodes.tableCell : schema.nodes.tableHeader;

    // 把 row 内所有 cells 替换为目标类型
    const newCells: ReturnType<typeof schema.nodes.tableCell.create>[] = [];
    rowNode.forEach((cell) => {
      if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
        newCells.push(targetType.create(cell.attrs, cell.content, cell.marks));
      }
    });

    const newRow = schema.nodes.tableRow.create(rowNode.attrs, newCells);
    const tr = state.tr.replaceWith(rowPos, rowPos + rowNode.nodeSize, newRow);
    view.dispatch(tr);
  } else {
    // column：找光标所在 cell，从 cell 找 column 索引，遍历所有 row 把该 column 的 cell 替换
    let cellDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === 'tableCell' || name === 'tableHeader') {
        cellDepth = d;
        break;
      }
    }
    if (cellDepth === -1) return;

    const cellNode = $from.node(cellDepth);
    const rowDepth = cellDepth - 1; // tableRow 在 cell 的上一层（depth 值更小）
    if ($from.node(rowDepth).type.name !== 'tableRow') return;

    // 算 cell 在 row 内的 column 索引
    const rowNode = $from.node(rowDepth);
    let colIndex = $from.index(cellDepth);
    if (colIndex < 0) return;

    // 判断该 column 是否已经是 header
    const cellIsHeader = cellNode.type.name === 'tableHeader';

    // 遍历整张表，把所有 row 中该 column 索引的 cell 替换
    // depth 层级：table(d) → row(d+1) → cell(d+2)；光标在 cell 内时 cellDepth = d+2，
    // rowDepth = cellDepth-1 = d+1，所以 table 在 rowDepth-1（不是 rowDepth+1）
    const tableDepth = rowDepth - 1;
    const tableNode = $from.node(tableDepth);
    if (tableNode.type.name !== 'table') return;
    const tablePos = $from.before(tableDepth);

    // 用 mapping 记录原始位置 → 新位置
    let tr = state.tr;
    // 从下往上处理避免位置偏移
    const rowsToProcess: { rowPos: number; rowNode: { attrs: object; forEach: (cb: (child: { type: { name: string }; attrs: object; content: unknown; marks: unknown }) => void) => void; nodeSize: number } }[] = [];
    tableNode.forEach((row) => {
      if (row.type.name !== 'tableRow') return;
      // 算该 row 在 table 内的位置
      let rowOffset = 0;
      tableNode.forEach((child, childOffset) => {
        if (child === row) rowOffset = childOffset;
      });
      rowsToProcess.push({ rowPos: tablePos + 1 + rowOffset, rowNode: row });
    });

    // 倒序处理
    for (let i = rowsToProcess.length - 1; i >= 0; i--) {
      const { rowPos, rowNode: r } = rowsToProcess[i];
      const targetCells: unknown[] = [];
      let idx = 0;
      r.forEach((cell) => {
        if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
          if (idx === colIndex) {
            const newType = cellIsHeader ? schema.nodes.tableCell : schema.nodes.tableHeader;
            targetCells.push(
              newType.create(
                cell.attrs as never,
                cell.content as never,
                cell.marks as never,
              ),
            );
          } else {
            targetCells.push(cell as unknown);
          }
          idx++;
        }
      });
      const newRow = schema.nodes.tableRow.create(r.attrs, targetCells as never);
      tr = tr.replaceWith(rowPos, rowPos + r.nodeSize, newRow);
    }
    view.dispatch(tr);
  }
}
const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'];

// SECURITY/STORAGE: inline images are embedded as base64 data URLs inside the
// Tiptap JSON stored in the DB — they bloat rows quickly. Cap the size; larger
// images must go through the attachment upload (uploads module) instead.
const MAX_INLINE_IMAGE_BYTES = 1024 * 1024; // 1MB

export function TiptapEditor({
  content,
  onChange,
  placeholder,
  editable = true,
  className = '',
  outputFormat = 'json',
  collab,
}: TiptapEditorProps) {
  const t = useTranslations('kb');
  const c = useTranslations('common');
  const ph = placeholder ?? t('editorPlaceholder');
  const [showTextColor, setShowTextColor] = useState(false);
  // G1 P2-C：协同态维护 Yjs 文档与 provider（惰性创建，unmount 清理）
  const collabRef = useRef<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);
  if (collab && !collabRef.current) {
    const ydoc = new Y.Doc();
    // B4 修复（2026-08-19 上线前全检）：kb-collab WS 地址可配置（NEXT_PUBLIC_KB_COLLAB_URL，
    // 生产经 Docker build arg 注入，如 wss://host:3002/kb-collab）；未配置时回退同源 3002
    const configured = process.env.NEXT_PUBLIC_KB_COLLAB_URL;
    const wsUrl =
      configured ||
      `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3002/kb-collab`;
    const provider = new WebsocketProvider(
      wsUrl,
      collab.pageId,
      ydoc,
      // 鉴权默认走 httpOnly cookie（同站 ws 握手自动携带）；显式 token 时也支持
      ...(collab.token ? [{ params: { token: collab.token } }] : []),
    );
    collabRef.current = { ydoc, provider };
  }
  useEffect(() => {
    const cp = collabRef.current;
    return () => {
      if (cp) {
        cp.provider.destroy();
        cp.ydoc.destroy();
        collabRef.current = null;
      }
    };
  }, []);
  const [showBgColor, setShowBgColor] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showCellBg, setShowCellBg] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [, forceUpdate] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({ placeholder: ph }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle.extend({
        addAttributes() {
          return {
            fontSize: {
              default: null,
              parseHTML: (el: HTMLElement) => el.style.fontSize,
              renderHTML: (attrs: Record<string, unknown>) => {
                if (!attrs.fontSize) return {};
                return { style: `font-size: ${attrs.fontSize}` };
              },
            },
            paddingLeft: {
              default: null,
              parseHTML: (el: HTMLElement) => el.style.paddingLeft,
              renderHTML: (attrs: Record<string, unknown>) => {
                if (!attrs.paddingLeft) return {};
                return { style: `padding-left: ${attrs.paddingLeft}` };
              },
            },
          };
        },
      }),
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell.extend({
        // Tiptap 默认 TableCell 无 backgroundColor/verticalAlign 属性 →
        // setCellAttribute 静默失败。补上（背景色 + 垂直对齐），保留父级属性。
        addAttributes() {
          return {
            ...(this.parent?.() ?? {}),
            backgroundColor: {
              default: null,
              parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
              renderHTML: (attrs) => attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
            },
            verticalAlign: {
              default: null,
              parseHTML: (el: HTMLElement) => el.style.verticalAlign || null,
              renderHTML: (attrs) => attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign}` } : {},
            },
          };
        },
      }),
      TableHeader,
    ],
    // G1 P2-C：协同态 Collaboration 必须是第一个扩展（接管文档状态）
    ...(collabRef.current
      ? [Collaboration.configure({ document: collabRef.current.ydoc })]
      : []),
    content: content || {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    editable,
    onCreate({ editor }) {
      const cp = collabRef.current;
      if (!cp) return;
      // 服务器无历史状态（首个协作者）：Yjs 文档空 → 用传入 content 初始化并上传为权威
      const seedContent = content && typeof content === 'object' && content.type === 'doc' ? content : null;
      cp.provider.on('sync', (synced: boolean) => {
        if (!synced) return;
        const docText = cp.ydoc.getText('default').toString();
        const empty = !docText.trim() && (editor.isEmpty || !editor.getJSON().content?.length);
        if (empty && seedContent) {
          editor.commands.setContent(seedContent);
        }
      });
    },
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return true;
            if (file.size > MAX_INLINE_IMAGE_BYTES) {
              console.warn('Inline image too large (max 1MB); use attachment upload instead');
              return true;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
              const dataUrl = e.target?.result as string;
              editor?.chain().focus().setImage({ src: dataUrl }).run();
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (onChange) {
        onChange(outputFormat === 'html' ? ed.getHTML() : ed.getJSON(), ed.getText());
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const onSelection = () => forceUpdate((n) => n + 1);
    editor.on('selectionUpdate', onSelection);
    return () => { editor.off('selectionUpdate', onSelection); };
  }, [editor]);

  const setColor = useCallback((color: string) => {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setShowTextColor(false);
  }, [editor]);

  const setBgColor = useCallback((color: string) => {
    if (!editor) return;
    if (color === 'transparent') {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setShowBgColor(false);
  }, [editor]);

  const setFontSize = useCallback((size: string) => {
    if (!editor) return;
    editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    setShowFontSize(false);
  }, [editor]);

  const setCellBg = useCallback((color: string) => {
    if (!editor) return;
    if (color === 'transparent') {
      editor.chain().focus().setCellAttribute('backgroundColor', null).run();
    } else {
      editor.chain().focus().setCellAttribute('backgroundColor', color).run();
    }
    setShowCellBg(false);
  }, [editor]);

  const indent = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('listItem') || editor.isActive('taskItem')) {
      editor.chain().focus().sinkListItem('listItem').run();
    } else {
      // For paragraphs: use tab-like behavior via textStyle indent (basic CSS)
      editor.chain().focus().setMark('textStyle', { paddingLeft: '24px' }).run();
    }
  }, [editor]);

  const outdent = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('listItem') || editor.isActive('taskItem')) {
      editor.chain().focus().liftListItem('listItem').run();
    } else {
      editor.chain().focus().setMark('textStyle', { paddingLeft: '0px' }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const inTable = editor.isActive('table');

  const btnClass = (active = false) =>
    `rounded p-1.5 transition-colors ${
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`;

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {editable && (
        <div className="shrink-0 bg-background">
          {/* Toolbar Row 1 (matches Confluence style) */}
          <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-3 py-1.5">
            {/* Font size dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowFontSize(!showFontSize); setShowTextColor(false); setShowBgColor(false); setShowLink(false); setShowCellBg(false); }}
                className={btnClass()}
                title={t('fontSize')}
              >
                <span className="flex items-center gap-1 text-xs font-medium">
                  <span className="hidden sm:inline">{t('fontSize')}</span>
                  <span className="text-muted-foreground">▾</span>
                </span>
              </button>
              {showFontSize && (
                <div className="absolute left-0 top-full z-50 mt-1 flex flex-col rounded border border-border bg-white shadow-lg dark:bg-slate-900">
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFontSize(s)}
                      className="px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { editor.chain().focus().unsetMark('textStyle').run(); setShowFontSize(false); }}
                    className="border-t border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                  >
                    {t('clearColor')}
                  </button>
                </div>
              )}
            </div>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Format: Bold / Italic / Underline / Strikethrough */}
            <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title={t('bold')}><Bold size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title={t('italic')}><Italic size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title={t('underline')}><UnderlineIcon size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title={t('strike')}><Strikethrough size={16} /></button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Font color / Background highlight */}
            <button type="button" onClick={() => { setShowTextColor(!showTextColor); setShowBgColor(false); setShowLink(false); setShowFontSize(false); setShowCellBg(false); }} className={btnClass()} title={t('foregroundColor')}><Palette size={16} /></button>
            <button type="button" onClick={() => { setShowBgColor(!showBgColor); setShowTextColor(false); setShowLink(false); setShowFontSize(false); setShowCellBg(false); }} className={btnClass()} title={t('backgroundColor')}><Highlighter size={16} /></button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Lists: bullet / ordered / task */}
            <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title={t('bulletList')}><List size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title={t('orderedList')}><ListOrdered size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={btnClass(editor.isActive('taskList'))} title={t('taskList')}><ListChecks size={16} /></button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Outdent / Indent */}
            <button type="button" onClick={outdent} className={btnClass()} title={t('outdent')}><Outdent size={16} /></button>
            <button type="button" onClick={indent} className={btnClass()} title={t('indent')}><Indent size={16} /></button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Text alignment: left / center / right */}
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editor.isActive({ textAlign: 'left' }))} title={t('alignLeft')}><AlignLeft size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editor.isActive({ textAlign: 'center' }))} title={t('alignCenter')}><AlignCenter size={16} /></button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnClass(editor.isActive({ textAlign: 'right' }))} title={t('alignRight')}><AlignRight size={16} /></button>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Image / Link / Table */}
            <label className={`cursor-pointer rounded p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground`} title={t('insertImage')}>
              <ImageIcon size={16} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > MAX_INLINE_IMAGE_BYTES) {
                    console.warn('Inline image too large (max 1MB); use attachment upload instead');
                    e.target.value = '';
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    editor.chain().focus().setImage({ src: ev.target?.result as string }).run();
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
            <button type="button" onClick={() => {
              setShowLink(!showLink);
              setShowTextColor(false);
              setShowBgColor(false);
              setShowFontSize(false);
              setShowCellBg(false);
              if (!showLink) {
                const existing = editor.getAttributes('link').href;
                setLinkUrl(existing || 'https://');
              }
            }} className={btnClass(editor.isActive('link'))} title={t('link')}>
              {editor.isActive('link') ? <Link2 className="text-primary" size={16} /> : <Link2 size={16} />}
            </button>
            {editor.isActive('link') && (
              <button type="button" onClick={() => editor.chain().focus().unsetLink().run()} className={btnClass()} title={t('unlink')}>
                <Link2Off size={14} className="text-destructive" />
              </button>
            )}
            <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className={btnClass(inTable)} title={t('insertTable')}><TableIcon size={16} /></button>

            <div className="ml-auto flex items-center gap-0.5">
              <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnClass()} title={t('undo')}><Undo2 size={16} /></button>
              <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnClass()} title={t('redo')}><Redo2 size={16} /></button>
            </div>
          </div>

          {/* Toolbar Row 2 — table operations (only when cursor is in table) */}
          {inTable && (
            <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/20 px-3 py-1.5">
              {/* Row ops (Confluence-style custom icons) */}
              <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} className={btnClass()} title={t('addRowBefore')}><AddRowAboveIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className={btnClass()} title={t('addRowAfter')}><AddRowBelowIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className={btnClass()} title={t('deleteRow')}><DeleteRowIcon /></button>

              <div className="mx-1 h-5 w-px bg-border" />

              {/* Column ops (Confluence-style custom icons) */}
              <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} className={btnClass()} title={t('addColumnBefore')}><AddColumnLeftIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className={btnClass()} title={t('addColumnAfter')}><AddColumnRightIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className={btnClass()} title={t('deleteColumn')}><DeleteColumnIcon /></button>

              <div className="mx-1 h-5 w-px bg-border" />

              {/* Merge / split */}
              <button type="button" onClick={() => editor.chain().focus().mergeCells().run()} className={btnClass()} title={t('mergeCells')}><MergeCellsIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().splitCell().run()} className={btnClass()} title={t('splitCell')}><SplitCellIcon /></button>

              <div className="mx-1 h-5 w-px bg-border" />

              {/* Vertical alignment inside cell */}
              <button type="button" onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'top').run()} className={btnClass()} title={t('valignTop')}><CellAlignTopIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'middle').run()} className={btnClass()} title={t('valignMiddle')}><CellAlignMiddleIcon /></button>
              <button type="button" onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', 'bottom').run()} className={btnClass()} title={t('valignBottom')}><CellAlignBottomIcon /></button>

              <div className="mx-1 h-5 w-px bg-border" />

              {/* Header row / column toggle — 自定义：明确基于光标所在行/列 */}
              <button
                type="button"
                onClick={() => toggleHeaderAtCursor(editor, 'row')}
                className={btnClass()}
                title={t('toggleHeaderRow')}
              >
                <ToggleHeaderRowIcon />
              </button>
              <button
                type="button"
                onClick={() => toggleHeaderAtCursor(editor, 'column')}
                className={btnClass()}
                title={t('toggleHeaderColumn')}
              >
                <ToggleHeaderColumnIcon />
              </button>

              <div className="mx-1 h-5 w-px bg-border" />

              {/* Cell background color */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowCellBg(!showCellBg); setShowTextColor(false); setShowBgColor(false); setShowLink(false); setShowFontSize(false); }}
                  className={btnClass()}
                  title={t('tableBackground')}
                >
                  <PaintBucket size={16} />
                </button>
                {showCellBg && (
                  <div className="absolute left-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded border border-border bg-white p-2 shadow-lg dark:bg-slate-900" style={{ width: '180px' }}>
                    {BG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCellBg(c)}
                        className={`h-6 w-6 rounded border transition-transform hover:scale-110 ${
                          c === 'transparent' ? 'bg-[repeating-linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc_25%)]' : ''
                        }`}
                        style={c !== 'transparent' ? { backgroundColor: c } : {}}
                        title={c === 'transparent' ? t('clearColor') : c}
                      />
                    ))}
                  </div>
                )}
              </div>

              <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className={btnClass()} title={t('deleteTable')}><DeleteTableIcon /></button>
            </div>
          )}

          {/* Color picker: text color */}
          {showTextColor && (
            <div className="flex flex-wrap gap-1 border-b bg-card px-3 py-2">
              {FONT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded border transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          )}

          {/* Color picker: background highlight */}
          {showBgColor && (
            <div className="flex flex-wrap gap-1 border-b bg-card px-3 py-2">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBgColor(c)}
                  className={`h-6 w-6 rounded border transition-transform hover:scale-110 ${
                    c === 'transparent' ? 'bg-[repeating-linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc_25%)]' : ''
                  }`}
                  style={c !== 'transparent' ? { backgroundColor: c } : {}}
                  title={c === 'transparent' ? t('clearColor') : c}
                />
              ))}
            </div>
          )}

          {/* Link input */}
          {showLink && (
            <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t('linkPlaceholder')}
                className="flex-1 rounded border bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && linkUrl.trim()) {
                    editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                    setShowLink(false);
                  }
                  if (e.key === 'Escape') setShowLink(false);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (linkUrl.trim()) {
                    editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                    setShowLink(false);
                  }
                }}
                className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                disabled={!linkUrl.trim()}
              >
                {c('confirm')}
              </button>
              <button type="button" onClick={() => setShowLink(false)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                {c('cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-auto min-h-0">
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-6 dark:prose-invert [&_.ProseMirror]:outline-none
            [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h1]:mb-4
            [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mt-5 [&_.ProseMirror_h2]:mb-3
            [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-2
            [&_.ProseMirror_h4]:text-lg [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:mt-3 [&_.ProseMirror_h4]:mb-1
            [&_.ProseMirror_h5]:text-base [&_.ProseMirror_h5]:font-semibold [&_.ProseMirror_h5]:mt-2
            [&_.ProseMirror_h6]:text-sm [&_.ProseMirror_h6]:font-semibold [&_.ProseMirror_h6]:mt-2
            [&_.ProseMirror_p]:mb-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6
            [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:cursor-pointer [&_.ProseMirror_a]:hover:text-blue-800
            [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-2 [&_.ProseMirror_img]:shadow-sm
            [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:border
            [&_.ProseMirror_th]:border [&_.ProseMirror_th]:bg-muted [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-semibold
            [&_.ProseMirror_td]:border [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2 [&_.ProseMirror_td]:align-top
            [&_.ProseMirror_.column-resize-handle]:absolute [&_.ProseMirror_.column-resize-handle]:right-[-2px] [&_.ProseMirror_.column-resize-handle]:top-0 [&_.ProseMirror_.column-resize-handle]:bottom-0 [&_.ProseMirror_.column-resize-handle]:w-2 [&_.ProseMirror_.column-resize-handle]:cursor-col-resize [&_.ProseMirror_.column-resize-handle]:bg-primary/20 [&_.ProseMirror_.column-resize-handle]:hover:bg-primary/60
            [&_.ProseMirror_.column-resize-handle]:before:content-['⇔'] [&_.ProseMirror_.column-resize-handle]:before:absolute [&_.ProseMirror_.column-resize-handle]:before:-left-[3px] [&_.ProseMirror_.column-resize-handle]:before:-top-4 [&_.ProseMirror_.column-resize-handle]:before:text-[10px] [&_.ProseMirror_.column-resize-handle]:before:text-primary
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        />
      </div>
    </div>
  );
}