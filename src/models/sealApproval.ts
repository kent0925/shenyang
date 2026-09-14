export type SealApprovalType = '簽呈' | '用印' | '借印';

export interface SealApprovalData {
  company: string;          // 公司名稱（預設三家之一或自填）
  applyDate: string;        // 申請日期 YYYY-MM-DD
  types: SealApprovalType[]; // 類型（複選：簽呈、用印、借印）
  subject: string;          // 主旨
  description: string;      // 說明（以換行分隔，最多建議17行）
}

export const DEFAULT_COMPANIES = [
  '昇陽開發實業股份有限公司',
  '頂邑開發股份有限公司',
  '紫雲國際股份有限公司',
  '馬非廣告股份有限公司',
];

export const INITIAL_SEAL_APPROVAL_DATA: SealApprovalData = {
  company: '昇陽開發實業股份有限公司',
  applyDate: new Date().toISOString().split('T')[0],
  types: ['用印'],
  subject: '',
  description: '',
};
