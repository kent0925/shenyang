/**
 * Schema.gs - 資料表名稱、欄位架構與列舉常數定義
 * 
 * 核心規範：
 * 1. Google Sheets 使用者可見名稱（Sheet 分頁名稱、第一列 Header）全部使用繁體中文。
 * 2. 程式內部 key、API JSON key、變數名稱一律維持英文。
 * 3. 提供明確的 internalKey ↔ 中文欄位名稱 mapping 與雙向轉換工具。
 * 4. 欄位格式規範：
 *    - 帳號、統編、銀行代碼、分行代碼等欄位強制使用純文字格式 (@)，防範前置 0 遺失。
 *    - 金額欄位使用千分位數值格式 (#,##0)。
 *    - 一般日期使用 yyyy/MM/dd。
 *    - 日期時間使用 yyyy/MM/dd HH:mm:ss。
 */

/**
 * 工作表中文名稱定義
 */
var SHEETS = {
  // 主檔資料庫 Sheets
  PROJECTS: '專案主檔',
  SUB_PROJECTS: '分案主檔',
  VENDORS: '廠商主檔',
  YEAR_CONFIG: '年度設定',
  BILLING_CYCLE_RULES: '請款週期規則',
  BILLING_PERIODS: '請款期別',

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
  SHEETS.SUB_PROJECTS,
  SHEETS.VENDORS,
  SHEETS.YEAR_CONFIG,
  SHEETS.BILLING_CYCLE_RULES,
  SHEETS.BILLING_PERIODS,
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
 * 完整欄位 Schema 定義
 * 包含：英文 key、中文 label、資料型態 type
 * type:
 *   - 'text': 純文字格式 (@)，適用 ID、代碼、統編、帳號等
 *   - 'number': 數值千分位格式 (#,##0)
 *   - 'date': 台灣標準日期格式 (yyyy/MM/dd)
 *   - 'datetime': 台灣標準日期時間格式 (yyyy/MM/dd HH:mm:ss)
 *   - 'json': 長文字/JSON
 *   - 'boolean': 布林值
 */
var SCHEMAS = {
  // 1. 專案主檔
  '專案主檔': {
    columns: [
      { key: 'projectId', label: '專案編號', type: 'text' },
      { key: 'company', label: '公司', type: 'text' },
      { key: 'projectName', label: '專案名稱', type: 'text' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 2. 廠商主檔
  '廠商主檔': {
    columns: [
      { key: 'vendorId', label: '廠商編號', type: 'text' },
      { key: 'vendorName', label: '廠商名稱', type: 'text' },
      { key: 'taxId', label: '統一編號', type: 'text' },
      { key: 'entityType', label: '登記類型', type: 'text' },
      { key: 'bankCode', label: '金融機構代碼', type: 'text' },
      { key: 'bankName', label: '金融機構名稱', type: 'text' },
      { key: 'branchCode', label: '分支機構代碼', type: 'text' },
      { key: 'branchName', label: '分支機構名稱', type: 'text' },
      { key: 'accountName', label: '戶名', type: 'text' },
      { key: 'accountNumber', label: '帳號', type: 'text' },
      { key: 'isActive', label: '啟用狀態', type: 'boolean' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
      { key: 'bankAccounts', label: '匯款帳號清單', type: 'json' },
    ],
  },

  // 3. 分案主檔（固定兩層：專案 → 分案）
  '分案主檔': {
    columns: [
      { key: 'subProjectId', label: '分案編號', type: 'text' },
      { key: 'projectId', label: '專案編號', type: 'text' },
      { key: 'subProjectName', label: '分案名稱', type: 'text' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 3. 年度設定
  '年度設定': {
    columns: [
      { key: 'year', label: '年度', type: 'text' },
      { key: 'spreadsheetId', label: '試算表編號', type: 'text' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'archivedAt', label: '封存時間', type: 'datetime' },
    ],
  },

  // 3. 請款週期規則：以版本及生效日保存；絕不回算既有期別。
  '請款週期規則': {
    columns: [
      { key: 'ruleId', label: '規則編號', type: 'text' },
      { key: 'effectiveFrom', label: '生效日', type: 'date' },
      { key: 'submissionDay', label: '送件日', type: 'number' },
      { key: 'paymentMonthOffset', label: '付款月份位移', type: 'number' },
      { key: 'paymentDay', label: '付款日', type: 'number' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 4. 請款期別 Snapshot：歷史請款只讀取這些欄位，不使用目前規則重新計算。
  '請款期別': {
    columns: [
      { key: 'billingPeriodId', label: '期別編號', type: 'text' },
      { key: 'claimPeriodKey', label: '請款月份', type: 'text' },
      { key: 'ruleId', label: '規則編號', type: 'text' },
      { key: 'periodName', label: '期別名稱', type: 'text' },
      { key: 'periodStart', label: '週期開始日', type: 'date' },
      { key: 'periodEnd', label: '週期截止日', type: 'date' },
      { key: 'submissionDate', label: '送件日', type: 'date' },
      { key: 'expectedPaymentDate', label: '預計付款日', type: 'date' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 4. 預算項目
  '預算項目': {
    columns: [
      { key: 'budgetItemId', label: '預算項目編號', type: 'text' },
      { key: 'year', label: '年度', type: 'text' },
      { key: 'projectId', label: '專案編號', type: 'text' },
      { key: 'company', label: '公司', type: 'text' },
      { key: 'projectName', label: '專案名稱', type: 'text' },
      { key: 'subProjectId', label: '分案編號', type: 'text' },
      { key: 'subProjectName', label: '分案名稱', type: 'text' },
      { key: 'itemName', label: '項目名稱', type: 'text' },
      { key: 'vendorId', label: '廠商編號', type: 'text' },
      { key: 'vendorName', label: '廠商名稱', type: 'text' },
      { key: 'budgetAmount', label: '預算金額', type: 'number' },
      { key: 'terminatedAmount', label: '終止金額', type: 'number' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 5. 表單紀錄
  '表單紀錄': {
    columns: [
      { key: 'formId', label: '表單編號', type: 'text' },
      { key: 'formType', label: '表單類型', type: 'text' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
      { key: 'createdBy', label: '建立人', type: 'text' },
      { key: 'company', label: '公司', type: 'text' },
      { key: 'projectId', label: '專案編號', type: 'text' },
      { key: 'projectName', label: '專案名稱', type: 'text' },
      { key: 'subProjectId', label: '分案編號', type: 'text' },
      { key: 'subProjectName', label: '分案名稱', type: 'text' },
      { key: 'vendorId', label: '廠商編號', type: 'text' },
      { key: 'vendorName', label: '廠商名稱', type: 'text' },
      { key: 'vendorTaxId', label: '廠商統一編號', type: 'text' },
      { key: 'budgetType', label: '預算類型', type: 'text' },
      { key: 'budgetItemId', label: '預算項目編號', type: 'text' },
      { key: 'amount', label: '金額', type: 'number' },
      { key: 'payloadJson', label: '表單完整資料', type: 'json' },
      { key: 'excelFileId', label: 'Excel檔案編號', type: 'text' },
      { key: 'pdfFileId', label: 'PDF檔案編號', type: 'text' },
      { key: 'version', label: '版本', type: 'number' },
      { key: 'billingPeriodId', label: '請款期別編號', type: 'text' },
      { key: 'claimPeriodKey', label: '請款月份', type: 'text' },
      { key: 'periodName', label: '請款期別名稱', type: 'text' },
      { key: 'periodStart', label: '請款週期開始日', type: 'date' },
      { key: 'periodEnd', label: '請款週期截止日', type: 'date' },
      { key: 'submissionDate', label: '送件日', type: 'date' },
      { key: 'expectedPaymentDate', label: '預計付款日', type: 'date' },
    ],
  },

  // 6. 請款紀錄
  '請款紀錄': {
    columns: [
      { key: 'claimId', label: '請款編號', type: 'text' },
      { key: 'formId', label: '表單編號', type: 'text' },
      { key: 'year', label: '年度', type: 'text' },
      { key: 'claimPeriod', label: '請款期別', type: 'text' },
      { key: 'claimSequence', label: '請款期次', type: 'number' },
      { key: 'claimDate', label: '請款日期', type: 'date' },
      { key: 'company', label: '公司', type: 'text' },
      { key: 'projectId', label: '專案編號', type: 'text' },
      { key: 'projectName', label: '專案名稱', type: 'text' },
      { key: 'subProjectId', label: '分案編號', type: 'text' },
      { key: 'subProjectName', label: '分案名稱', type: 'text' },
      { key: 'vendorId', label: '廠商編號', type: 'text' },
      { key: 'vendorName', label: '廠商名稱', type: 'text' },
      { key: 'vendorTaxId', label: '廠商統一編號', type: 'text' },
      { key: 'budgetType', label: '預算類型', type: 'text' },
      { key: 'budgetItemId', label: '預算項目編號', type: 'text' },
      { key: 'itemName', label: '項目名稱', type: 'text' },
      { key: 'unbudgetedReason', label: '預算外原因', type: 'text' },
      { key: 'currentClaimAmount', label: '本期請款金額', type: 'number' },
      { key: 'retentionAmount', label: '保留款', type: 'number' },
      { key: 'advanceOffsetAmount', label: '預付款沖抵', type: 'number' },
      { key: 'penaltyAmount', label: '違約金／折讓', type: 'number' },
      { key: 'payableAmount', label: '本期應付金額', type: 'number' },
      { key: 'status', label: '狀態', type: 'text' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 7. 付款紀錄
  '付款紀錄': {
    columns: [
      { key: 'paymentId', label: '付款編號', type: 'text' },
      { key: 'claimId', label: '請款編號', type: 'text' },
      { key: 'formId', label: '表單編號', type: 'text' },
      { key: 'budgetType', label: '預算類型', type: 'text' },
      { key: 'budgetItemId', label: '預算項目編號', type: 'text' },
      { key: 'company', label: '公司', type: 'text' },
      { key: 'projectId', label: '專案編號', type: 'text' },
      { key: 'projectName', label: '專案名稱', type: 'text' },
      { key: 'vendorId', label: '廠商編號', type: 'text' },
      { key: 'vendorName', label: '廠商名稱', type: 'text' },
      { key: 'itemName', label: '項目名稱', type: 'text' },
      { key: 'amount', label: '付款金額', type: 'number' },
      { key: 'status', label: '付款狀態', type: 'text' },
      { key: 'paymentDate', label: '付款日期', type: 'date' },
      { key: 'year', label: '年度', type: 'text' },
      { key: 'month', label: '月份', type: 'number' },
      { key: 'createdAt', label: '建立時間', type: 'datetime' },
      { key: 'updatedAt', label: '更新時間', type: 'datetime' },
    ],
  },

  // 8. 異動紀錄
  '異動紀錄': {
    columns: [
      { key: 'logId', label: '紀錄編號', type: 'text' },
      { key: 'timestamp', label: '時間', type: 'datetime' },
      { key: 'user', label: '使用者', type: 'text' },
      { key: 'action', label: '動作', type: 'text' },
      { key: 'entityType', label: '資料類型', type: 'text' },
      { key: 'entityId', label: '資料編號', type: 'text' },
      { key: 'detailJson', label: '異動內容', type: 'json' },
    ],
  },
};

/**
 * 取得特定工作表的中文 Header 陣列（供 Google Sheet 顯示）
 * @param {string} sheetName 中文工作表名稱
 * @return {Array<string>}
 */
function getSheetHeaders(sheetName) {
  var schema = SCHEMAS[sheetName];
  if (!schema || !schema.columns) {
    throw new Error('未定義的 Sheet Schema: ' + sheetName);
  }
  return schema.columns.map(function (col) {
    return col.label;
  });
}

/**
 * 取得特定工作表的英文 Key 陣列（供程式內部使用）
 * @param {string} sheetName 中文工作表名稱
 * @return {Array<string>}
 */
function getSheetKeys(sheetName) {
  var schema = SCHEMAS[sheetName];
  if (!schema || !schema.columns) {
    throw new Error('未定義的 Sheet Schema: ' + sheetName);
  }
  return schema.columns.map(function (col) {
    return col.key;
  });
}

/**
 * 將試算表列資料（依照中文 Header 順序）轉為內部英文 Key 的 JavaScript 物件
 * @param {string} sheetName 中文工作表名稱
 * @param {Array<any>} rowValues 試算表一列資料
 * @return {Object} 英文 key 物件
 */
function rowToObject(sheetName, rowValues) {
  var schema = SCHEMAS[sheetName];
  if (!schema || !schema.columns) {
    throw new Error('未定義的 Sheet Schema: ' + sheetName);
  }
  var values = rowValues ? rowValues.slice() : [];
  // Legacy yearly rows predate the two subdivision columns. Read them safely by
  // inserting blank values at the schema position; never infer a subdivision.
  var subIndex = -1;
  schema.columns.forEach(function (col, index) { if (col.key === 'subProjectId') subIndex = index; });
  if (subIndex !== -1 && values.length === schema.columns.length - 2) {
    values.splice(subIndex, 0, '', '');
  }
  var obj = {};
  schema.columns.forEach(function (col, idx) {
    obj[col.key] = (values && values[idx] !== undefined) ? values[idx] : null;
  });
  return obj;
}

/**
 * 將內部英文 Key 的 JavaScript 物件轉為試算表儲存的一列陣列值（依欄位定義順序）
 * @param {string} sheetName 中文工作表名稱
 * @param {Object} obj 英文 key 物件
 * @return {Array<any>}
 */
function objectToRow(sheetName, obj) {
  var schema = SCHEMAS[sheetName];
  if (!schema || !schema.columns) {
    throw new Error('未定義的 Sheet Schema: ' + sheetName);
  }
  return schema.columns.map(function (col) {
    var val = (obj && obj[col.key] !== undefined) ? obj[col.key] : '';
    // 若為文字型別且值非空，確保轉為字串
    if (col.type === 'text' && val !== null && val !== undefined) {
      return String(val);
    }
    return val;
  });
}

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
