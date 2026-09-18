import { useState } from 'react';
import type { PendingAttachment, PendingAttachmentRetry } from '../models/attachments';
import { cancelFormAttachmentUpload, retryAttachments } from './formAttachments';

type FormKind = 'seal' | 'payment';
export function useFormAttachments() {
  const [pending, setPending] = useState<Record<FormKind, PendingAttachment[]>>({ seal: [], payment: [] });
  const [pendingAttachmentRetry, setRetry] = useState<Record<FormKind, PendingAttachmentRetry | null>>({ seal: null, payment: null });
  const [refresh, setRefresh] = useState(0);
  const change = (kind: FormKind, attachments: PendingAttachment[]) => setPending(previous => ({ ...previous, [kind]: attachments }));
  const discardFailedAttachment = async (kind: FormKind, attachmentId: string) => {
    if (!pending[kind].some(a => a.attachmentId === attachmentId && a.status === 'failed')) return;
    const retry = pendingAttachmentRetry[kind];
    if (!retry) return;
    try {
      await cancelFormAttachmentUpload(retry.formId, retry.version, attachmentId);
    } catch {
      setPending(previous => ({ ...previous, [kind]: previous[kind].map(a => a.attachmentId === attachmentId ? { ...a, error: '附件暫存清理失敗，請再試一次。' } : a) }));
      return;
    }
    setPending(previous => ({ ...previous, [kind]: previous[kind].filter(a => a.attachmentId !== attachmentId) }));
    setRetry(previous => {
      const retry = previous[kind];
      if (!retry) return previous;
      const attachments = retry.attachments.filter(a => a.attachmentId !== attachmentId);
      return { ...previous, [kind]: attachments.length ? { ...retry, attachments } : null };
    });
  };
  const clear = (kind: FormKind) => {
    if (pendingAttachmentRetry[kind]) return;
    change(kind, []); setRetry(previous => ({ ...previous, [kind]: null })); setRefresh(n => n + 1);
  };
  const upload = async (kind: FormKind, formId: string, version: number) => {
    if (pendingAttachmentRetry[kind]) throw new Error('尚有附件上傳失敗，請先重試或移除失敗附件。');
    return performUpload(kind, { formId, version, attachments: pending[kind] });
  };
  const retryFailed = async (kind: FormKind) => {
    const retry = pendingAttachmentRetry[kind];
    return retry ? performUpload(kind, retry) : true;
  };
  const performUpload = async (kind: FormKind, retry: PendingAttachmentRetry) => {
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
  return { pending, pendingAttachmentRetry, refresh, change, clear, upload, retryFailed, discardFailedAttachment };
}
