'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tagApi } from '@/lib/api-client';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface TagInputProps {
  workspaceId: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function TagInput({ workspaceId, tags, onChange, placeholder }: TagInputProps) {
  const t = useTranslations('tag');
  const ph = placeholder ?? t('placeholder');
  const [inputVal, setInputVal] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch all tags in workspace for auto-suggest
  const { data: allTags = [] } = useQuery({
    queryKey: ['workspace-tags', workspaceId],
    queryFn: () => tagApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const suggestions = allTags.filter(
    (t) => t.toLowerCase().includes(inputVal.toLowerCase()) && !tags.includes(t),
  );

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputVal('');
    setShowSuggestions(false);
  }, [tags, onChange]);

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  // Click outside to close suggestions
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex min-h-[32px] flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-within:ring-1 focus-within:ring-ring">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="inline-flex hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(inputVal);
            } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            } else if (e.key === 'Escape') {
              setShowSuggestions(false);
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          className="min-w-[80px] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={tags.length === 0 ? ph : ''}
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && inputVal && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-32 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
