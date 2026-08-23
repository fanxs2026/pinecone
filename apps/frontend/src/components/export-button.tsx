'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, ChevronDown, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';
import { downloadCsv } from '@/lib/export-csv';
import { downloadExcel } from '@/lib/export-excel';
import { downloadPdf } from '@/lib/export-pdf';
import { useTranslations } from 'next-intl';

export interface ExportRow {
  cells: (string | number | null | undefined)[];
  checked: boolean;
}

interface ExportButtonProps {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /** 勾选导出：true 时只导出 checked 的行；无勾选时导出全部 */
  selectedIds?: Set<string>;
  /** 行 id 列表（与 selectedIds 配合定位勾选行） */
  rowIds?: string[];
  disabled?: boolean;
  pdfTitle?: string;
}

/**
 * 下载下拉菜单按钮 — CSV / Excel(.xls) / PDF 三种格式
 */
export default function ExportButton({
  filename,
  headers,
  rows,
  selectedIds,
  rowIds,
  disabled,
  pdfTitle,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const c = useTranslations('common');

  // 勾选优先：勾选行数 > 0 时导出勾选行，否则导出全部
  const exportRows = (): (string | number | null | undefined)[][] => {
    if (selectedIds && rowIds && selectedIds.size > 0) {
      const idSet = selectedIds;
      return rows.filter((_, i) => idSet.has(rowIds[i]));
    }
    return rows;
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doExport = async (format: 'csv' | 'excel' | 'pdf') => {
    setOpen(false);
    const data = exportRows();
    if (data.length === 0) return;
    if (format === 'csv') {
      downloadCsv(filename, headers, data);
    } else if (format === 'excel') {
      downloadExcel(filename, headers, data);
    } else {
      await downloadPdf(filename, headers, data, pdfTitle);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(!open)}>
        <Download className="mr-1 h-4 w-4" /> {c('download')}
        <ChevronDown className="ml-1 h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border bg-white p-1 text-sm shadow-2xl">
          <button
            onClick={() => doExport('csv')}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
          >
            <FileType2 className="h-4 w-4 text-emerald-600" /> CSV
          </button>
          <button
            onClick={() => doExport('excel')}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel (.xlsx)
          </button>
          <button
            onClick={() => doExport('pdf')}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
          >
            <FileText className="h-4 w-4 text-red-600" /> PDF
          </button>
        </div>
      )}
    </div>
  );
}
