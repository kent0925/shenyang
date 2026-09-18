import { useState } from 'react';
import type { PendingAttachment, PendingAttachmentRetry } from '../models/attachments';
import { retryAttachments } from './formAttachments';

type FormKind = 'seal' | 'payment';
export function useFormAttachments() {
  const [pending, setPending] = useState<Record<FormKind, PendingAttachment[]>>({ seal: [], payment: [] });
  const [pendingAttachmentRetry, setRetry] = useState<Record<FormKind, PendingAttachmentRetry | null>>({ seal: null, payment: null });
  const [refresh, setRefresh] = useState(0);
  const change = (kind: FormKind, attachments: PendingAttachment[]) => setPending(previous => ({ ...previous, [kind]: attachments }));
  const clear = (kind: FormKind) => {
    change(kind, []); setRetry(previous => ({ ...previous, [kind]: null })); setRefresh(n => n + 1);
  };
  const upload = async (kind: FormKind, formId: string, version: number) => {
    const retry = pendingAttachmentRetry[kind] || { formId, version, attachments: pending[kind] };
    if (!retry.attachments.length) return true;
    setRetry(previous => ({ ...previous, [kind]: retry }));
    const uploadingIds = new Set(retry.attachments.map(a => a.attachmentId));
    const failed = await retryAttachments(retry, attachments => {
      setPending(previous => ({ ...previous, [kind]: [...previous[kind].filter(a => !uploadingIds.has(a.attachmentId)), ...attachments] }));
      setRetry(previous => ({ ...previous, [kind]: attachments.length ? { ...retry, attachments } : null }));
    });
    setRefresh(n => n + 1);
    return failed.length === 0;
  };
  return { pending, pendingAttachmentRetry, refresh, change, clear, upload };
}
