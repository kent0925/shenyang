import { backendClient } from './backendClient';
import { base64ToBlob, blobToBase64 } from '../utils/fileBlob';
import { ATTACHMENT_CHUNK_SIZE, GENERAL_ATTACHMENT_MAX, GENERAL_MIMES } from '../models/attachments';
import type { AttachmentFileInfo, FormAttachment, PendingAttachment, PendingAttachmentRetry } from '../models/attachments';

export const ATTACHMENT_CONFLICT = '表單版本已更新，請重新載入最新版後重新加入附件。';
export const ATTACHMENT_PARTIAL_FAILURE = '表單與正式文件已儲存完成，但部分附件尚未上傳成功。';

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function generalAttachment(file: File): PendingAttachment {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = GENERAL_MIMES[extension];
  if (!mime || /[\\/\x00-\x1f]/.test(file.name) || file.name.length > 180) throw new Error('不支援的附件格式或檔名。');
  if (!file.size || file.size > GENERAL_ATTACHMENT_MAX) throw new Error('一般附件單檔須大於 0 且不超過 10 MB。');
  return { attachmentId: `ATT-${crypto.randomUUID()}`, type: 'general', displayName: file.name,
    metadata: null, files: [{ key: 'primary', fileName: file.name, blob: file.slice(0, file.size, mime) }], status: 'pending' };
}

export async function uploadAttachment(formId: string, version: number, attachment: PendingAttachment): Promise<void> {
  const identity = { formId, expectedVersion: version, attachmentId: attachment.attachmentId };
  const files: AttachmentFileInfo[] = [];
  for (const file of attachment.files) {
    files.push({ key: file.key, fileName: file.fileName, mimeType: file.blob.type, size: file.blob.size, sha256: await sha256(file.blob) });
  }
  const begun = await backendClient.request<{ published: boolean }>('beginFormAttachmentUpload', {
    ...identity, type: attachment.type, displayName: attachment.displayName, metadata: attachment.metadata, files,
  });
  if (begun.published) return;
  for (const file of attachment.files) {
    for (let offset = 0, index = 0; offset < file.blob.size; offset += ATTACHMENT_CHUNK_SIZE, index++) {
      const chunk = file.blob.slice(offset, offset + ATTACHMENT_CHUNK_SIZE);
      await backendClient.request('uploadFormAttachmentChunk', {
        ...identity, fileKey: file.key, index, base64: await blobToBase64(chunk), chunkSha256: await sha256(chunk),
      });
    }
    await backendClient.request('finalizeFormAttachmentFile', { ...identity, fileKey: file.key });
  }
  await backendClient.request('finalizeFormAttachment', identity);
}

export async function retryAttachments(retry: PendingAttachmentRetry,
  onChange: (attachments: PendingAttachment[]) => void): Promise<PendingAttachment[]> {
  let remaining = retry.attachments;
  for (const attachment of retry.attachments) {
    remaining = remaining.map(a => a.attachmentId === attachment.attachmentId ? { ...a, status: 'uploading', error: undefined } : a);
    onChange(remaining);
    try {
      await uploadAttachment(retry.formId, retry.version, attachment);
      remaining = remaining.filter(a => a.attachmentId !== attachment.attachmentId);
    } catch (error) {
      const conflict = (error as { code?: string }).code === 'VERSION_CONFLICT';
      const message = conflict ? ATTACHMENT_CONFLICT : error instanceof Error ? error.message : '附件上傳失敗，請重試。';
      remaining = remaining.map(a => a.attachmentId === attachment.attachmentId ? { ...a, status: 'failed', error: message } : a);
    }
    onChange(remaining);
  }
  return remaining;
}

export function listFormAttachments(formId: string, version: number): Promise<FormAttachment[]> {
  return backendClient.request('listFormAttachments', { formId, version });
}

export async function downloadAttachment(formId: string, version: number, attachmentId: string): Promise<{ blob: Blob; fileName: string }> {
  const identity = { formId, version, attachmentId };
  const info = await backendClient.request<AttachmentFileInfo & { chunkCount: number }>('getFormAttachmentFileInfo', identity);
  const chunks: Blob[] = [];
  for (let index = 0; index < info.chunkCount; index++) {
    const chunk = await backendClient.request<{ base64: string; index: number }>('getFormAttachmentFileChunk', { ...identity, index });
    if (chunk.index !== index) throw new Error('附件分塊順序錯誤。');
    chunks.push(base64ToBlob(chunk.base64, info.mimeType));
  }
  const blob = new Blob(chunks, { type: info.mimeType });
  if (blob.size !== info.size || await sha256(blob) !== info.sha256) throw new Error('附件下載不完整，請重試。');
  return { blob, fileName: info.fileName };
}
