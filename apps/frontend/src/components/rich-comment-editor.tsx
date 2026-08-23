'use client';

import { useEffect, useState } from 'react';
import { TiptapEditor } from '@/components/kb/tiptap-editor';

interface RichCommentEditorProps {
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
}

/**
 * 评论富文本编辑器——直接复用知识库完整编辑器
 * （图片/表格/任务列表/对齐/缩进/颜色/底色/字号/链接/撤销重做）
 * content/onChange 走 HTML 格式（outputFormat='html'）
 */
export function RichCommentEditor({ value, onChange, placeholder }: RichCommentEditorProps) {
  // 提交后外部置空 → 用 key 重挂载重置编辑器
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (value === '') setResetKey((k) => k + 1);
  }, [value]);

  return (
    <TiptapEditor
      key={resetKey}
      content={value || ''}
      outputFormat="html"
      placeholder={placeholder}
      onChange={(html, text) => onChange(html as string, text)}
    />
  );
}
