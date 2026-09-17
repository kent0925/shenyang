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
  chequeTimingMode?: 'immediate' | 'days' | 'date'; // 遠期支票兌現條件三選一：即期 / 天數 / 指定兌現日期
  chequeDays?: number;      // 遠期支票天數（正整數）
}

export interface PaymentRequestData {
  company: string;          // 公司名稱
  applyDate: string;        // 申請日期 YYYY-MM-DD

  // Phase 2B-3C/D 主檔關聯與預算控制
  projectId?: string;       // 專案主檔 ID (PRJ-xxxx)
  subProjectId?: string;    // 分案主檔 ID (SUB-xxxx)
  subProjectName?: string;
  vendorId?: string;        // 廠商主檔 ID (VND-xxxx)
  budgetType?: 'budgeted' | 'unbudgeted'; // 預算類型（預設 budgeted）
  budgetItemId?: string;    // 預算項目 ID (BGT-xxxx)
  budgetItemName?: string;  // 預算項目名稱

  project: string;          // 專案代號/名稱 (保留既有文字)
  requisitionNumber: string;// 請購單編號
  vendor: string;           // 受款人/廠商
  vendorTaxId?: string;     // 統一編號（8 碼數字，選填）
  department: string;       // 費用歸屬部門
  contractNumber: string;   // 合約/訂購單編號

  // 銀行帳號結構化資訊
  bankAccount: BankAccountInfo;
  bankCode?: string;         // 3 碼銀行代碼（如 007）
  bankName?: string;         // 銀行名稱（如 第一商業銀行）
  branchCode?: string;       // 分行代碼（如 1440）
  branchName?: string;       // 分行名稱（如 城東分行）
  accountName?: string;      // 戶名
  accountNumber?: string;    // 帳號（字串型態，保留前置 0）
  accountNameSameAsVendor?: boolean; // 戶名是否同受款人/廠商名稱（預設 true）

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
  projectId: '',
  subProjectId: '',
  subProjectName: '',
  vendorId: '',
  budgetType: 'budgeted',
  budgetItemId: '',
  budgetItemName: '',
  project: '',
  requisitionNumber: '',
  vendor: '',
  vendorTaxId: '',
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
  bankCode: '',
  bankName: '',
  branchCode: '',
  branchName: '',
  accountName: '',
  accountNumber: '',
  accountNameSameAsVendor: true,
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
    chequeTimingMode: undefined,
    chequeDays: undefined,
  },
  description: '',
};
