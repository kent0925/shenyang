export interface BankAccountInfo {
  type: 'code' | 'name';    // 銀行代碼或銀行全名二擇一
  bankCode: string;         // 銀行代碼（如 007）
  bankName: string;         // 銀行全名（如 第一商業銀行）
  branch: string;           // 分行（分行代碼或中文名稱）
  accountName: string;      // 戶名
  accountNumber: string;    // 帳號
}

export interface SpecialRequirements {
  noCross: boolean;         // 請勿劃線
  noEndorse: boolean;       // 請勿禁止背書轉讓
  cashiersCheck: boolean;   // 請開立銀行本票/台銀支票
  postDatedCheck: boolean;  // 請付遠期支票予受款者
  postDatedDate: string;    // 遠期支票到期日 YYYY-MM-DD
  wireTransfer: boolean;    // 請以匯款支付
  offsetBorrowing: boolean; // 請沖銷借支款
}

export interface PaymentRequestData {
  company: string;          // 公司名稱
  applyDate: string;        // 申請日期 YYYY-MM-DD
  project: string;          // 專案代號/名稱
  requisitionNumber: string;// 請購單編號
  vendor: string;           // 受款人/廠商
  department: string;       // 費用歸屬部門
  contractNumber: string;   // 合約/訂購單編號
  bankAccount: BankAccountInfo; // 銀行帳號結構化資訊
  expenseNature: string;    // 費用性質
  contractTotal: string;    // 合約/訂購單總額
  dueDate: string;          // 付款到期日 YYYY-MM-DD
  
  // 付款明細（本期）
  currentAmount: string;    // (1) 請款/驗收/預付額
  retentionAmount: string;  // (2) 保留金額
  advanceDeduction: string; // (3) 預付款沖銷
  penaltyDiscount: string;  // (4) 罰扣（折讓金額）
  
  specialRequirements: SpecialRequirements; // 特殊要求
  description: string;      // 請款說明（以換行分隔，最多建議16行）
}

export const INITIAL_PAYMENT_REQUEST_DATA: PaymentRequestData = {
  company: '昇陽開發實業股份有限公司',
  applyDate: new Date().toISOString().split('T')[0],
  project: '',
  requisitionNumber: '',
  vendor: '',
  department: '',
  contractNumber: '',
  bankAccount: {
    type: 'code',
    bankCode: '',
    bankName: '',
    branch: '',
    accountName: '',
    accountNumber: '',
  },
  expenseNature: '',
  contractTotal: '',
  dueDate: '',
  currentAmount: '',
  retentionAmount: '',
  advanceDeduction: '',
  penaltyDiscount: '',
  specialRequirements: {
    noCross: false,
    noEndorse: false,
    cashiersCheck: false,
    postDatedCheck: false,
    postDatedDate: '',
    wireTransfer: true,
    offsetBorrowing: false,
  },
  description: '',
};
