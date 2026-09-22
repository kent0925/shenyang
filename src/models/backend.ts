/**
 * src/models/backend.ts - 後端資料庫實體與 API 請求／回應型別定義
 *
 * Source of truth: gas/Schema.gs, gas/ApiService.gs
 *
 * 欄位原則：
 * 1. 嚴格對照 GAS 後端欄位，不自行發明不存在欄位。
 * 2. 帳號、金融機構代碼、分支機構代碼、統一編號一律強制維持 string，絕不轉為 number。
 */

// ==========================================
// 1. 專案主檔 (Projects)
// ==========================================

export interface Project {
  projectId: string;
  company: string;
  projectName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveProjectPayload {
  projectId?: string;
  company: string;
  projectName: string;
  status?: string;
}

export interface SubProject {
  subProjectId: string;
  projectId: string;
  subProjectName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSubProjectPayload {
  subProjectId?: string;
  projectId: string;
  subProjectName: string;
  status?: string;
}

export interface ListSubProjectsPayload {
  projectId?: string;
  status?: string;
}

// ==========================================
// 2. 廠商主檔 (Vendors)
// ==========================================

export interface VendorBankAccount {
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountName: string;
  accountNumber: string;
}

export interface Vendor {
  vendorId: string;
  vendorName: string;
  taxId: string;
  entityType: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountName: string;
  accountNumber: string;
  bankAccounts?: VendorBankAccount[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveVendorPayload {
  vendorId?: string;
  vendorName: string;
  taxId?: string;
  entityType?: string;
  bankCode?: string;
  bankName?: string;
  branchCode?: string;
  branchName?: string;
  accountName?: string;
  accountNumber?: string;
  bankAccounts?: VendorBankAccount[];
  isActive?: boolean;
}

// ==========================================
// 3. 預算項目 (BudgetItems)
// ==========================================

export interface BudgetItem {
  budgetItemId: string;
  year: string;
  projectId: string;
  company: string;
  projectName: string;
  subProjectId?: string;
  subProjectName?: string;
  itemName: string;
  vendorId: string;
  vendorName: string;
  budgetAmount: number;
  terminatedAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListBudgetItemsPayload {
  year?: number | string;
  projectId?: string;
  subProjectId?: string;
}

export interface SaveBudgetItemPayload {
  budgetItemId?: string;
  year?: number | string;
  projectId?: string;
  company: string;
  projectName: string;
  subProjectId?: string;
  subProjectName?: string;
  itemName: string;
  vendorId?: string;
  vendorName?: string;
  budgetAmount?: number;
  terminatedAmount?: number;
  status?: string;
}

// ==========================================
// 4. 請款週期規則與期別 Snapshot
// ==========================================

export interface BillingCycleRule {
  ruleId: string;
  effectiveFrom: string;
  submissionDay: number;
  paymentMonthOffset: number;
  paymentDay: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPeriod {
  billingPeriodId: string;
  claimPeriodKey: string;
  ruleId: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  submissionDate: string;
  expectedPaymentDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveBillingCycleRulePayload {
  effectiveFrom: string;
  submissionDay: number;
  paymentMonthOffset: number;
  paymentDay: number;
  confirmCoverageGap?: boolean;
}

export interface BillingCycleRulePreview {
  proposed: Omit<BillingPeriod, 'createdAt' | 'updatedAt'>;
  historicalPeriodsUnchanged: boolean;
  existingClaimsUnchanged: boolean;
  overlaps: string[];
  requiresCoverageConfirmation: boolean;
  coverageWarning: string;
}

export interface BillingPeriodReport {
  period: BillingPeriod;
  rows: FormRecord[];
  claimCount: number;
  totalAmount: number;
  projectSubtotals: Array<{ name: string; amount: number }>;
  subProjectSubtotals: Array<{ name: string; amount: number }>;
  vendorSubtotals: Array<{ name: string; amount: number }>;
}

export interface FinancialSummaryItem {
  totalBudget: number;
  claimedAmount: number;
  remainingBudget: number;
}

export interface FinancialSummary {
  projects: Record<string, FinancialSummaryItem>;
  subProjects: Record<string, FinancialSummaryItem>;
  orphanBudgetItemIds: string[];
}

// ==========================================
// 4. 表單紀錄 (Forms)
// ==========================================

export type FormType = 'payment_request' | 'seal_approval';

export type FormStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | string;

export type BudgetType = 'budgeted' | 'unbudgeted' | string;

export interface FormRecord<TPayload = any> {
  formId: string;
  formType: FormType;
  status: FormStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  company: string;
  projectId: string;
  projectName: string;
  subProjectId?: string;
  subProjectName?: string;
  vendorId: string;
  vendorName: string;
  vendorTaxId: string;
  budgetType: BudgetType;
  budgetItemId: string;
  amount: number;
  payloadJson: string;
  excelFileId: string;
  pdfFileId: string;
  version: number;
  billingPeriodId?: string;
  claimPeriodKey?: string;
  periodName?: string;
  periodStart?: string;
  periodEnd?: string;
  submissionDate?: string;
  expectedPaymentDate?: string;
  parsedPayload?: TPayload;
}

export interface ListFormsPayload {
  year?: number | string;
  formType?: FormType | string;
  projectId?: string;
  vendorId?: string;
  status?: string;
}

export interface GetFormPayload {
  formId: string;
  year?: number | string;
}

export interface SaveFormPayload {
  formId?: string;
  formType: FormType;
  company: string;
  year?: number | string;
  status?: FormStatus;
  createdBy?: string;
  projectId?: string;
  projectName?: string;
  subProjectId?: string;
  subProjectName?: string;
  vendorId?: string;
  vendorName?: string;
  vendorTaxId?: string;
  budgetType?: BudgetType;
  budgetItemId?: string;
  amount?: number;
  payloadJson?: string | Record<string, any>;
  excelFileId?: string;
  pdfFileId?: string;
  version?: number;
  expectedVersion?: number;
}

// ==========================================
// 5. 檔案歸檔與讀取 (Archive & File Retrieval)
// ==========================================

export interface ArchiveFileSpec {
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface ArchiveFormFilesPayload {
  formId: string;
  year?: number;
  expectedVersion: number;
  excel: ArchiveFileSpec;
  pdf: ArchiveFileSpec;
}

export interface ArchiveFormFilesResult {
  formId: string;
  version: number;
  excelFileId: string;
  pdfFileId: string;
  excelFileName: string;
  pdfFileName: string;
}

export interface GetArchivedFormFilePayload {
  formId: string;
  fileType: 'excel' | 'pdf';
  year?: number;
  version?: number;
}

export interface ArchivedFormFileResult {
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface ArchivedVersionItem {
  version: number;
  isCurrent: boolean;
  excelAvailable: boolean;
  pdfAvailable: boolean;
  excelFileName?: string;
  pdfFileName?: string;
  archivedAt?: string;
}

export interface ListArchivedFormVersionsPayload {
  formId: string;
  year?: number;
}

// ==========================================
// 6. 系統健康檢查 (Health)
// ==========================================

export interface BackendHealthData {
  service: string;
  status: string;
  schemaVersion: string;
  currentYear: string;
}

