export const ATTACHMENT_CHUNK_SIZE = 2 * 1024 * 1024;
export const GENERAL_ATTACHMENT_MAX = 10 * 1024 * 1024;
export const GENERAL_MIMES: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
};
export type Orientation = 'landscape' | 'portrait' | 'square';
export interface PhotoMetadata {
  sequence: number; description: string; orientation: Orientation; rotation: number; archivedFileName: string;
}
export interface ConstructionMetadata {
  projectName: string; constructionDate: string; location: string; workDescription: string;
  photoCount: number; photos: PhotoMetadata[];
}
export interface AttachmentFileInfo {
  key: string; fileName: string; mimeType: string; size: number; sha256: string;
}
export interface FormAttachment {
  attachmentId: string; type: 'general' | 'construction'; displayName: string;
  addedVersion: number; createdAt: string; primaryFile: AttachmentFileInfo;
  metadata: ConstructionMetadata | null;
}
export interface ProcessedAttachmentFile { key: string; fileName: string; blob: Blob }
export interface PendingAttachment {
  attachmentId: string; type: FormAttachment['type']; displayName: string;
  metadata: ConstructionMetadata | null; files: ProcessedAttachmentFile[];
  status: 'pending' | 'uploading' | 'failed'; error?: string;
}
// Deliberately separate from formal archive retry; retains only processed blobs.
export interface PendingAttachmentRetry {
  formId: string; version: number; attachments: PendingAttachment[];
}
export interface ProcessedPhoto {
  id: string; blob: Blob; width: number; height: number; orientation: Orientation;
  rotation: number; description: string;
}
