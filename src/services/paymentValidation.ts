import type { PaymentRequestData } from '../models/paymentRequest';

export type PaymentValidationMode = 'read' | 'write';

/** Hierarchy is mandatory for new/normal writes, while legacy records remain readable. */
export function validatePaymentHierarchy(
  data: PaymentRequestData,
  mode: PaymentValidationMode,
  currentFormId?: string | null,
): Record<string, string> {
  const isLegacy = Boolean(currentFormId) && !(data.subProjectId || '').trim();
  if (mode === 'read' && isLegacy) return {};

  const errors: Record<string, string> = {};
  if (!(data.projectId || '').trim()) errors.project = '請選擇專案主檔';
  if (!(data.subProjectId || '').trim()) errors.subProjectId = '請選擇分案';
  return errors;
}
