/**
 * Schema.gs - 資料表名稱、欄位架構與列舉常數定義
 * 
 * 規則：
 * 1. Google Sheet 工作表名稱使用繁體中文。
 * 2. 程式內部常數、JSON key、interface 使用英文。
 * 3. 帳號、統編、銀行代碼、分行代碼等欄位強制使用純文字格式保存，防範前置 0 遺失。
 */

/**
 * 工作表中文名稱定義
 */
var SHEETS = {
  // 主檔資料庫 Sheets
  PROJECTS: '專案主檔',
  VENDORS: '廠商主檔',
  YEAR_CONFIG: '年度設定',

  // 年度資料庫 Sheets
  BUDGET_ITEMS: '預算項目',
  FORMS: '表單紀錄',
  CLAIMS: '請款紀錄',
  PAYMENTS: '付款紀錄',
  AUDIT_LOG: '異動紀錄',
};

/**
 * 主檔資料庫工作表清單
 */
var MASTER_SHEET_NAMES = [
  SHEETS.PROJECTS,
  SHEETS.VENDORS,
  SHEETS.YEAR_CONFIG,
];

/**
 * 年度資料庫工作表清單
 */
var YEAR_SHEET_NAMES = [
  SHEETS.BUDGET_ITEMS,
  SHEETS.FORMS,
  SHEETS.CLAIMS,
  SHEETS.PAYMENTS,
  SHEETS.AUDIT_LOG,
];

/**
 * 資料庫表格詳細 Schema 定義
 * 包含：欄位名稱(headers)、純文字格式欄位(textColumns)、數值格式欄位(numberColumns)、日期格式欄位(dateColumns)
 */
var SCHEMAS = {
  // 1. 專案主檔
  '專案主檔': {
    headers: [
      'projectId',
      'company',
      'projectName',
      'status',
      'createdAt',
      'updatedAt',
    ],
    textColumns: ['projectId', 'company', 'projectName', 'status'],
    numberColumns: [],
    dateColumns: ['createdAt', 'updatedAt'],
  },

  // 2. 廠商主檔
  '廠商主檔': {
    headers: [
      'vendorId',
      'vendorName',
      'taxId',
      'entityType',
      'bankCode',
      'bankName',
      'branchCode',
      'branchName',
      'accountName',
      'accountNumber',
      'isActive',
      'createdAt',
      'updatedAt',
    ],
    // accountNumber, taxId, bankCode, branchCode 必須強制使用文字格式保存，避免 007 變成 7
    textColumns: [
      'vendorId',
      'vendorName',
      'taxId',
      'entityType',
      'bankCode',
      'bankName',
      'branchCode',
      'branchName',
      'accountName',
      'accountNumber',
    ],
    numberColumns: [],
    dateColumns: ['createdAt', 'updatedAt'],
  },

  // 3. 年度設定
  '年度設定': {
    headers: [
      'year',
      'spreadsheetId',
      'status',
      'createdAt',
      'archivedAt',
    ],
    textColumns: ['year', 'spreadsheetId', 'status'],
    numberColumns: [],
    dateColumns: ['createdAt', 'archivedAt'],
  },

  // 4. 預算項目
  '預算項目': {
    headers: [
      'budgetItemId',
      'year',
      'projectId',
      'company',
      'projectName',
      'itemName',
      'vendorId',
      'vendorName',
      'budgetAmount',
      'terminatedAmount',
      'status',
      'createdAt',
      'updatedAt',
    ],
    textColumns: [
      'budgetItemId',
      'year',
      'projectId',
      'company',
      'projectName',
      'itemName',
      'vendorId',
      'vendorName',
      'status',
    ],
    numberColumns: ['budgetAmount', 'terminatedAmount'],
    dateColumns: ['createdAt', 'updatedAt'],
  },

  // 5. 表單紀錄
  '表單紀錄': {
    headers: [
      'formId',
      'formType',
      'status',
      'createdAt',
      'updatedAt',
      'createdBy',
      'company',
      'projectId',
      'projectName',
      'vendorId',
      'vendorName',
      'vendorTaxId',
      'budgetType',
      'budgetItemId',
      'amount',
      'payloadJson',
      'excelFileId',
      'pdfFileId',
      'version',
    ],
    textColumns: [
      'formId',
      'formType',
      'status',
      'createdBy',
      'company',
      'projectId',
      'projectName',
      'vendorId',
      'vendorName',
      'vendorTaxId',
      'budgetType',
      'budgetItemId',
      'payloadJson',
      'excelFileId',
      'pdfFileId',
    ],
    numberColumns: ['amount', 'version'],
    dateColumns: ['createdAt', 'updatedAt'],
  },

  // 6. 請款紀錄
  '請款紀錄': {
    headers: [
      'claimId',
      'formId',
      'year',
      'claimPeriod',
      'claimSequence',
      'claimDate',
      'company',
      'projectId',
      'projectName',
      'vendorId',
      'vendorName',
      'vendorTaxId',
      'budgetType',
      'budgetItemId',
      'itemName',
      'unbudgetedReason',
      'currentClaimAmount',
      'retentionAmount',
      'advanceOffsetAmount',
      'penaltyAmount',
      'payableAmount',
      'status',
      'createdAt',
      'updatedAt',
    ],
    textColumns: [
      'claimId',
      'formId',
      'year',
      'claimPeriod',
      'company',
      'projectId',
      'projectName',
      'vendorId',
      'vendorName',
      'vendorTaxId',
      'budgetType',
      'budgetItemId',
      'itemName',
      'unbudgetedReason',
      'status',
    ],
    numberColumns: [
      'claimSequence',
      'currentClaimAmount',
      'retentionAmount',
      'advanceOffsetAmount',
      'penaltyAmount',
      'payableAmount',
    ],
    dateColumns: ['claimDate', 'createdAt', 'updatedAt'],
  },

  // 7. 付款紀錄
  '付款紀錄': {
    headers: [
      'paymentId',
      'claimId',
      'formId',
      'budgetType',
      'budgetItemId',
      'company',
      'projectId',
      'projectName',
      'vendorId',
      'vendorName',
      'itemName',
      'amount',
      'status',
      'paymentDate',
      'year',
      'month',
      'createdAt',
      'updatedAt',
    ],
    textColumns: [
      'paymentId',
      'claimId',
      'formId',
      'budgetType',
      'budgetItemId',
      'company',
      'projectId',
      'projectName',
      'vendorId',
      'vendorName',
      'itemName',
      'status',
      'year',
    ],
    numberColumns: ['amount', 'month'],
    dateColumns: ['paymentDate', 'createdAt', 'updatedAt'],
  },

  // 8. 異動紀錄
  '異動紀錄': {
    headers: [
      'logId',
      'timestamp',
      'user',
      'action',
      'entityType',
      'entityId',
      'detailJson',
    ],
    textColumns: ['logId', 'user', 'action', 'entityType', 'entityId', 'detailJson'],
    numberColumns: [],
    dateColumns: ['timestamp'],
  },
};

/**
 * 系統狀態與列舉值
 */
var STATUS = {
  YEAR: {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
  },
  PAYMENT: {
    SCHEDULED: 'scheduled',
    PAID: 'paid',
    CANCELLED: 'cancelled',
  },
  CLAIM: {
    PENDING: 'pending',
    APPROVED: 'approved',
    PAID: 'paid',
    CANCELLED: 'cancelled',
  },
  FORM: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  BUDGET_TYPE: {
    BUDGETED: 'budgeted',
    UNBUDGETED: 'unbudgeted',
  },
  FORM_TYPE: {
    PAYMENT_REQUEST: 'payment_request',
    SEAL_APPROVAL: 'seal_approval',
  },
};
