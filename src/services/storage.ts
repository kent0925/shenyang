import { SealApprovalData } from '../models/sealApproval';
import { PaymentRequestData } from '../models/paymentRequest';
import { backendStorageService } from './backendStorage';
import { serializeSealApproval, serializePaymentRequest } from './formAdapters';

export interface StorageService {
  saveSealApproval(data: SealApprovalData, formId?: string): Promise<{ success: boolean; id?: string }>;
  savePaymentRequest(data: PaymentRequestData, formId?: string): Promise<{ success: boolean; id?: string }>;
}

/**
 * 正式後端儲存適配服務：
 * 將前端領域表單透過 formAdapters 序列化後，呼叫 backendStorageService.saveForm 存入 GAS 後端。
 */
export class BackendStorageAdapterService implements StorageService {
  async saveSealApproval(data: SealApprovalData, formId?: string): Promise<{ success: boolean; id?: string }> {
    const payload = serializeSealApproval(data, formId);
    const record = await backendStorageService.saveForm(payload);
    return { success: true, id: record.formId };
  }

  async savePaymentRequest(data: PaymentRequestData, formId?: string): Promise<{ success: boolean; id?: string }> {
    const payload = serializePaymentRequest(data, formId);
    const record = await backendStorageService.saveForm(payload);
    return { success: true, id: record.formId };
  }
}

// 保留既有名稱以維持相容性，但在 Phase 2B-2C 正式實例化後端適配器
export const storageService = new BackendStorageAdapterService();
export const LocalStorageService = BackendStorageAdapterService;
