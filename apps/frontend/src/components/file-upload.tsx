'use client';

import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attachmentApi, type Attachment } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Paperclip, Camera, Trash2, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';

interface FileUploadProps {
  workspaceId: string;
  entityType: string;
  entityId: string;
}

export default function FileUpload({ workspaceId, entityType, entityId }: FileUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('fileUpload');
  const user = useAuthStore((s) => s.user);

  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', workspaceId, entityType, entityId],
    queryFn: () => attachmentApi.list(workspaceId, entityType, entityId).then((r) => r.data),
    enabled: !!workspaceId && !!entityId,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, category }: { file: File; category: 'FILE' | 'SCREENSHOT' }) =>
      attachmentApi.upload(workspaceId, entityType, entityId, file, category).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', workspaceId, entityType, entityId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => attachmentApi.remove(workspaceId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', workspaceId, entityType, entityId] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, category: 'FILE' | 'SCREENSHOT') => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate({ file, category });
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-2">
      {/* Upload buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Paperclip className="mr-1 h-3 w-3" />
          {uploadMutation.isPending ? t('uploading') : t('attachFile')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => screenshotInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Camera className="mr-1 h-3 w-3" />
          {uploadMutation.isPending ? t('uploading') : t('screenshot')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'FILE')}
        />
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'SCREENSHOT')}
        />
      </div>

      {/* Attachments list */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              {att.category === 'SCREENSHOT' ? (
                <Camera className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{att.fileName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(att.fileSize)}</span>
              {/* Only the uploader sees the delete button (backend enforces uploader-or-admin) */}
              {att.uploadedBy.id === user?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => deleteMutation.mutate(att.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
