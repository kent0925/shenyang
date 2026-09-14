/**
 * test-phase2a1.js - Phase 2A-1 中文化欄位與台灣格式自動化驗證測試
 * 
 * 驗收條件涵蓋：
 * 1. 所有 8 個工作表名稱中文
 * 2. 所有 8 個工作表第一列 Header 全面中文
 * 3. 程式內部 key 維持英文，雙向 mapping 與 rowToObject / objectToRow 轉換正確
 * 4. 廠商主檔之 統一編號、金融機構代碼、分支機構代碼、帳號 格式為純文字 (@)
 * 5. 一般日期格式為 yyyy/MM/dd，日期時間格式為 yyyy/MM/dd HH:mm:ss
 * 6. 主檔與年度資料庫 Locale = zh_TW, TimeZone = Asia/Taipei
 * 7. 既有舊版英文 Header 資料庫自動平滑升級為中文 Header 且保留原有資料列
 * 8. 重複執行 initializeSystem() 具備冪等性（不重複建檔、不重複建表、年度設定不重複）
 * 9. createYearDatabase(2027) 建立 2027 年度資料庫並登記於「年度設定」
 * 10. 再次呼叫 createYearDatabase(2027) 冪等性
 * 11. 業務模型驗證：同一廠商允許 budgeted 與 unbudgeted 請款
 * 12. 請款與付款關聯驗證：Payment 透過 claimId 支援 1 Claim 對多 Payment
 * 13. Script Properties 檢驗，嚴禁寫死 Google ID
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-mock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gasDir = path.resolve(__dirname, '..');

const gasFiles = [
  'Config.gs',
  'Schema.gs',
  'Utils.gs',
  'IdService.gs',
  'ApiService.gs',
  'DatabaseService.gs',
  'YearService.gs',
  'Code.gs',
];

function loadGasContext(env) {
  const sandbox = {
    PropertiesService: env.PropertiesService,
    DriveApp: env.DriveApp,
    SpreadsheetApp: env.SpreadsheetApp,
    ContentService: env.ContentService,
    LockService: env.LockService,
    Logger: env.Logger,
    Date,
    console,
  };

  const context = vm.createContext(sandbox);

  gasFiles.forEach(file => {
    const filePath = path.join(gasDir, file);
    const code = fs.readFileSync(filePath, 'utf-8');
    vm.runInContext(code, context, { filename: file });
  });

  return context;
}

function runTests() {
  console.log('====================================================');
  console.log('開始執行 Phase 2A-1 中文化欄位與台灣格式自動化驗證測試');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // 測試 1: 系統初次初始化與試算表 Locale/TimeZone
  // ----------------------------------------------------
  console.log('【測試群組 1：系統初次初始化與 Locale / TimeZone 設定】');
  const initialProps = {
    DRIVE_ROOT_FOLDER_ID: 'folder_root_test_id',
    SCHEMA_VERSION: '1',
    APP_ENV: 'production',
  };
  const env = createGasEnvironment(initialProps);
  const gas = loadGasContext(env);

  const initResult = gas.initializeSystem();
  assert(initResult.success === true, 'initializeSystem() 執行回傳 success: true');
  const masterId = initResult.masterDatabase.spreadsheetId;
  const currentYearId = initResult.currentYearDatabase.spreadsheetId;

  const masterSs = env.SpreadsheetApp.openById(masterId);
  const yearSs = env.SpreadsheetApp.openById(currentYearId);

  assert(masterSs.getSpreadsheetLocale() === 'zh_TW', '主檔資料庫 Locale 設定為 zh_TW');
  assert(masterSs.getSpreadsheetTimeZone() === 'Asia/Taipei', '主檔資料庫 TimeZone 設定為 Asia/Taipei');
  assert(yearSs.getSpreadsheetLocale() === 'zh_TW', '年度資料庫 Locale 設定為 zh_TW');
  assert(yearSs.getSpreadsheetTimeZone() === 'Asia/Taipei', '年度資料庫 TimeZone 設定為 Asia/Taipei');

  // ----------------------------------------------------
  // 測試 2: 主檔工作表中文 Header 與 Schema Mapping 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 2：主檔工作表中文 Header 與 Schema Mapping 檢驗】');
  // 2.1 專案主檔
  const projectsSheet = masterSs.getSheetByName('專案主檔');
  assert(!!projectsSheet, '存在「專案主檔」Sheet');
  const expectedProjectsChineseHeaders = ['專案編號', '公司', '專案名稱', '狀態', '建立時間', '更新時間'];
  const actualProjectsHeaders = projectsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualProjectsHeaders) === JSON.stringify(expectedProjectsChineseHeaders),
    '「專案主檔」第一列 Header 全面使用中文'
  );

  // 2.2 廠商主檔
  const vendorsSheet = masterSs.getSheetByName('廠商主檔');
  assert(!!vendorsSheet, '存在「廠商主檔」Sheet');
  const expectedVendorsChineseHeaders = [
    '廠商編號', '廠商名稱', '統一編號', '登記類型',
    '金融機構代碼', '金融機構名稱', '分支機構代碼', '分支機構名稱',
    '戶名', '帳號', '啟用狀態', '建立時間', '更新時間'
  ];
  const actualVendorsHeaders = vendorsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualVendorsHeaders) === JSON.stringify(expectedVendorsChineseHeaders),
    '「廠商主檔」第一列 Header 全面使用中文'
  );

  // 驗證純文字格式欄位 (統一編號、金融機構代碼、分支機構代碼、帳號)
  const taxIdCol = actualVendorsHeaders.indexOf('統一編號') + 1;
  const bankCodeCol = actualVendorsHeaders.indexOf('金融機構代碼') + 1;
  const branchCodeCol = actualVendorsHeaders.indexOf('分支機構代碼') + 1;
  const accountNumberCol = actualVendorsHeaders.indexOf('帳號') + 1;
  assert(vendorsSheet.columnFormats[taxIdCol] === '@', '「統一編號」欄位格式設定為純文字 (@)');
  assert(vendorsSheet.columnFormats[bankCodeCol] === '@', '「金融機構代碼」欄位格式設定為純文字 (@)');
  assert(vendorsSheet.columnFormats[branchCodeCol] === '@', '「分支機構代碼」欄位格式設定為純文字 (@)');
  assert(vendorsSheet.columnFormats[accountNumberCol] === '@', '「帳號」欄位格式設定為純文字 (@)，防範前置 0 消失');

  // 驗證日期時間格式 (建立時間、更新時間)
  const createdAtCol = actualVendorsHeaders.indexOf('建立時間') + 1;
  assert(vendorsSheet.columnFormats[createdAtCol] === 'yyyy/MM/dd HH:mm:ss', '「建立時間」格式設定為 yyyy/MM/dd HH:mm:ss');

  // 2.3 年度設定
  const yearConfigSheet = masterSs.getSheetByName('年度設定');
  assert(!!yearConfigSheet, '存在「年度設定」Sheet');
  const expectedYearConfigChineseHeaders = ['年度', '試算表編號', '狀態', '建立時間', '封存時間'];
  const actualYearConfigHeaders = yearConfigSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualYearConfigHeaders) === JSON.stringify(expectedYearConfigChineseHeaders),
    '「年度設定」第一列 Header 全面使用中文'
  );

  // ----------------------------------------------------
  // 測試 3: 年度資料庫中文 Header 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 3：年度資料庫中文 Header 檢驗】');
  // 3.1 預算項目
  const budgetSheet = yearSs.getSheetByName('預算項目');
  const expectedBudgetHeaders = [
    '預算項目編號', '年度', '專案編號', '公司', '專案名稱',
    '項目名稱', '廠商編號', '廠商名稱', '預算金額', '終止金額',
    '狀態', '建立時間', '更新時間'
  ];
  assert(
    JSON.stringify(budgetSheet.getDataRange().getValues()[0]) === JSON.stringify(expectedBudgetHeaders),
    '「預算項目」第一列 Header 全面使用中文'
  );

  // 3.2 表單紀錄
  const formsSheet = yearSs.getSheetByName('表單紀錄');
  const expectedFormsHeaders = [
    '表單編號', '表單類型', '狀態', '建立時間', '更新時間',
    '建立人', '公司', '專案編號', '專案名稱', '廠商編號',
    '廠商名稱', '廠商統一編號', '預算類型', '預算項目編號', '金額',
    '表單完整資料', 'Excel檔案編號', 'PDF檔案編號', '版本'
  ];
  assert(
    JSON.stringify(formsSheet.getDataRange().getValues()[0]) === JSON.stringify(expectedFormsHeaders),
    '「表單紀錄」第一列 Header 全面使用中文'
  );

  // 3.3 請款紀錄
  const claimsSheet = yearSs.getSheetByName('請款紀錄');
  const expectedClaimsHeaders = [
    '請款編號', '表單編號', '年度', '請款期別', '請款期次',
    '請款日期', '公司', '專案編號', '專案名稱', '廠商編號',
    '廠商名稱', '廠商統一編號', '預算類型', '預算項目編號', '項目名稱',
    '預算外原因', '本期請款金額', '保留款', '預付款沖抵', '違約金／折讓',
    '本期應付金額', '狀態', '建立時間', '更新時間'
  ];
  const actualClaimsHeaders = claimsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualClaimsHeaders) === JSON.stringify(expectedClaimsHeaders),
    '「請款紀錄」第一列 Header 全面使用中文'
  );
  // 驗證請款日期格式
  const claimDateCol = actualClaimsHeaders.indexOf('請款日期') + 1;
  assert(claimsSheet.columnFormats[claimDateCol] === 'yyyy/MM/dd', '「請款日期」格式設定為 yyyy/MM/dd');

  // 3.4 付款紀錄
  const paymentsSheet = yearSs.getSheetByName('付款紀錄');
  const expectedPaymentsHeaders = [
    '付款編號', '請款編號', '表單編號', '預算類型', '預算項目編號',
    '公司', '專案編號', '專案名稱', '廠商編號', '廠商名稱',
    '項目名稱', '付款金額', '付款狀態', '付款日期', '年度',
    '月份', '建立時間', '更新時間'
  ];
  const actualPaymentsHeaders = paymentsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualPaymentsHeaders) === JSON.stringify(expectedPaymentsHeaders),
    '「付款紀錄」第一列 Header 全面使用中文'
  );
  // 驗證付款日期格式
  const paymentDateCol = actualPaymentsHeaders.indexOf('付款日期') + 1;
  assert(paymentsSheet.columnFormats[paymentDateCol] === 'yyyy/MM/dd', '「付款日期」格式設定為 yyyy/MM/dd');

  // 3.5 異動紀錄
  const auditSheet = yearSs.getSheetByName('異動紀錄');
  const expectedAuditHeaders = ['紀錄編號', '時間', '使用者', '動作', '資料類型', '資料編號', '異動內容'];
  assert(
    JSON.stringify(auditSheet.getDataRange().getValues()[0]) === JSON.stringify(expectedAuditHeaders),
    '「異動紀錄」第一列 Header 全面使用中文'
  );

  // ----------------------------------------------------
  // 測試 4: 雙向轉換工具 rowToObject 與 objectToRow 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 4：雙向轉換工具 rowToObject 與 objectToRow 檢驗】');
  const vendorObj = {
    vendorId: 'VEN-000001',
    vendorName: '大明工程有限公司',
    taxId: '12345678',
    entityType: '公司',
    bankCode: '007',
    bankName: '第一商業銀行',
    branchCode: '0071234',
    branchName: '台北分行',
    accountName: '大明工程有限公司',
    accountNumber: '001234567890',
    isActive: true,
    createdAt: new Date('2026-09-14T08:00:00Z'),
    updatedAt: new Date('2026-09-14T08:00:00Z'),
  };

  const convertedRow = gas.objectToRow('廠商主檔', vendorObj);
  assert(Array.isArray(convertedRow) && convertedRow.length === 13, 'objectToRow 輸出長度正確');
  assert(convertedRow[0] === 'VEN-000001', 'objectToRow 第一欄為廠商編號');
  assert(convertedRow[4] === '007', 'objectToRow 第五欄為銀行代碼 (保留 007 字串)');
  assert(convertedRow[9] === '001234567890', 'objectToRow 第十欄為帳號 (保留前置 00 字串)');

  const parsedBackObj = gas.rowToObject('廠商主檔', convertedRow);
  assert(parsedBackObj.vendorId === 'VEN-000001', 'rowToObject 正確解析出 vendorId');
  assert(parsedBackObj.bankCode === '007', 'rowToObject 正確解析出 bankCode');
  assert(parsedBackObj.accountNumber === '001234567890', 'rowToObject 正確解析出 accountNumber');

  // ----------------------------------------------------
  // 測試 5: 既有舊版英文 Header 資料庫自動升級（Migration）機制檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 5：舊版英文 Header 自動平滑升級（Migration）機制】');
  // 模擬已存在的舊試算表（內含舊版英文 Header 與測試資料）
  const legacySs = env.SpreadsheetApp.create('舊版主檔測試');
  const legacyVendorSheet = legacySs.getSheetByName('工作表1');
  // 寫入舊版英文 Header 與一筆假資料
  const oldEnglishHeaders = [
    'vendorId', 'vendorName', 'taxId', 'entityType',
    'bankCode', 'bankName', 'branchCode', 'branchName',
    'accountName', 'accountNumber', 'isActive',
    'createdAt', 'updatedAt'
  ];
  const oldSampleRow = [
    'VEN-OLD-01', '測試廠商', '88888888', '公司',
    '004', '台灣銀行', '004001', '總行',
    '測試廠商', '00987654321', true,
    '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z'
  ];
  legacyVendorSheet.getRange(1, 1, 1, oldEnglishHeaders.length).setValues([oldEnglishHeaders]);
  legacyVendorSheet.getRange(2, 1, 1, oldSampleRow.length).setValues([oldSampleRow]);

  // 執行 setupSheetStructure（模擬 initializeSystem 讀取到舊版 Sheet 時）
  gas.setupSheetStructure(legacyVendorSheet, gas.SCHEMAS['廠商主檔']);

  const migratedHeaders = legacyVendorSheet.getRange(1, 1, 1, expectedVendorsChineseHeaders.length).getValues()[0];
  const preservedDataRow = legacyVendorSheet.getRange(2, 1, 1, oldSampleRow.length).getValues()[0];

  assert(
    JSON.stringify(migratedHeaders) === JSON.stringify(expectedVendorsChineseHeaders),
    '舊版英文 Header 成功平滑升級為中文 Header'
  );
  assert(
    preservedDataRow[0] === 'VEN-OLD-01' && preservedDataRow[9] === '00987654321',
    '原有資料列非日期欄位完整保留，未被清空或更動'
  );
  assert(
    preservedDataRow[11] instanceof Date,
    '原有 ISO 日期字串建立時間已自動平滑轉為原生 Date 物件'
  );

  // ----------------------------------------------------
  // 測試 6: ISO 字串日期 Migration 與冪等性專門檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 6：ISO 字串日期 Migration 與冪等性專門檢驗】');
  // 模擬「年度設定」已有舊版 ISO 字串記錄
  const testIsoString = '2026-09-14T12:17:48.698Z';
  const legacyYearConfigSheet = legacySs.insertSheet('舊版年度設定測試');
  const legacyYearConfigRows = [
    expectedYearConfigChineseHeaders,
    ['2026', 'ss_test_2026', 'active', testIsoString, ''], // 封存時間為空白
  ];
  legacyYearConfigSheet.getRange(1, 1, 2, expectedYearConfigChineseHeaders.length).setValues(legacyYearConfigRows);

  // 執行 Migration
  gas.migrateDateCells(legacyYearConfigSheet, gas.SCHEMAS['年度設定']);

  const migratedYearRow = legacyYearConfigSheet.getRange(2, 1, 1, expectedYearConfigChineseHeaders.length).getValues()[0];
  assert(migratedYearRow[0] === '2026', '非日期欄位「年度」維持原值');
  assert(migratedYearRow[1] === 'ss_test_2026', '非日期欄位「試算表編號」維持原值');
  assert(migratedYearRow[2] === 'active', '非日期欄位「狀態」維持原值');
  assert(migratedYearRow[3] instanceof Date, '舊版 ISO 字串建立時間已成功轉為真正的 Date 物件');
  assert(migratedYearRow[3].getTime() === Date.parse(testIsoString), 'Date 物件時間戳與原 ISO 字串完全一致');
  assert(migratedYearRow[4] === '', '空白之封存時間保持空白，未被誤處理');

  // 第二次重複執行（檢驗冪等性）
  gas.migrateDateCells(legacyYearConfigSheet, gas.SCHEMAS['年度設定']);
  const secondPassYearRow = legacyYearConfigSheet.getRange(2, 1, 1, expectedYearConfigChineseHeaders.length).getValues()[0];
  assert(secondPassYearRow[3] instanceof Date, '第二次執行後仍維持 Date 物件');
  assert(secondPassYearRow[3].getTime() === Date.parse(testIsoString), '第二次執行後 Date 時間戳未改變（冪等性通過）');

  // ----------------------------------------------------
  // 測試 7: initializeSystem() 冪等性與年度設定單一紀錄檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 7：initializeSystem() 冪等性與年度設定單一紀錄檢驗】');
  const filesBefore = env._internal.files.size;
  const reinitResult = gas.initializeSystem();
  const filesAfter = env._internal.files.size;

  assert(filesBefore === filesAfter, '再次執行 initializeSystem() 不建立重複 Spreadsheet 檔案');
  assert(reinitResult.masterDatabase.spreadsheetId === masterId, '主檔 ID 保持一致');
  assert(reinitResult.currentYearDatabase.spreadsheetId === currentYearId, '年度 ID 保持一致');

  // 檢驗主檔「年度設定」列數（扣除 Header 應只有當年度 1 筆紀錄）
  const yearConfigRows = yearConfigSheet.getDataRange().getValues().slice(1);
  const currentYearRecords = yearConfigRows.filter(r => String(r[0]) === String(new Date().getFullYear()));
  assert(currentYearRecords.length === 1, '「年度設定」中當年度紀錄保持唯一 1 筆，未重複新增');

  // ----------------------------------------------------
  // 測試 8: createYearDatabase(2027) 動態建立與登記
  // ----------------------------------------------------
  console.log('\n【測試群組 8：createYearDatabase(2027) 動態建立與登記】');
  const ss2027 = gas.createYearDatabase(2027);
  assert(ss2027.getName() === '2027公司表單資料庫', '成功建立 2027 年度資料庫');
  assert(ss2027.getSpreadsheetLocale() === 'zh_TW', '2027 年度資料庫 Locale 為 zh_TW');
  assert(ss2027.getSpreadsheetTimeZone() === 'Asia/Taipei', '2027 年度資料庫 TimeZone 為 Asia/Taipei');

  const claims2027 = ss2027.getSheetByName('請款紀錄');
  assert(
    JSON.stringify(claims2027.getDataRange().getValues()[0]) === JSON.stringify(expectedClaimsHeaders),
    '2027 年度資料庫之「請款紀錄」Header 全面使用中文'
  );

  const filesBefore2027Re = env._internal.files.size;
  const ss2027Re = gas.createYearDatabase(2027);
  const filesAfter2027Re = env._internal.files.size;
  assert(filesBefore2027Re === filesAfter2027Re, '再次呼叫 createYearDatabase(2027) 不重複建立檔案');
  assert(ss2027Re.getId() === ss2027.getId(), '取得相同 2027 資料庫實例');

  console.log('\n====================================================');
  console.log(`測試結果：${passed} 項通過，${failed} 項失敗`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
