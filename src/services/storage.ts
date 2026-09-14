import { SealApprovalData } from '../models/sealApproval';
import { PaymentRequestData } from '../models/paymentRequest';

export interface StorageService {
  saveSealApproval(data: SealApprovalData): Promise<{ success: boolean; id?: string }>;
  savePaymentRequest(data: PaymentRequestData): Promise<{ success: boolean; id?: string }>;
}

/**
 * 第一階段：純本機記憶體處理，不連線任何 Server/GAS/Database
 */
export class LocalStorageService implements StorageService {
  async saveSealApproval(_data: SealApprovalData): Promise<{ success: boolean; id?: string }> {
    // 第一階段為 no-op，未來第二階段在此介面串接 GAS Web App API
    return { success: true };
  }

  async savePaymentRequest(_data: PaymentRequestData): Promise<{ success: boolean; id?: string }> {
    // 第一階段為 no-op，未來第二階段在此介面串接 GAS Web App API
    return { success: true };
  }
}

export const storageService = new LocalStorageService();
