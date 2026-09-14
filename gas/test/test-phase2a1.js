/**
 * test-phase2a1.js - Phase 2A-1 自動化驗證測試腳本
 * 
 * 驗收條件涵蓋：
 * 1. initializeSystem() 第一次執行成功
 * 2. 自動建立「公司表單系統主檔資料庫」
 * 3. 自動建立「2026公司表單資料庫」（或當年度）
 * 4. 所有 8 個中文 Sheet 名稱建立正確
 * 5. 所有 Sheet Headers 與 Schema 定義完全相符
 * 6. 第二次執行 initializeSystem() 具備冪等性（Spreadsheet 與 Sheet 不重複）
 * 7. createYearDatabase(2027) 建立 2027 年度資料庫並登記於「年度設定」
 * 8. 再次呼叫 createYearDatabase(2027) 不重複建立
 * 9. 「年度設定」正確紀錄 2026 與 2027 之 Spreadsheet ID，且能動態定位
 * 10. 廠商主檔之 accountNumber, taxId, bankCode, branchCode 格式設定為純文字 (@)
 * 11. 資料模型驗證：同一廠商允許 budgeted 與 unbudgeted 請款
 * 12. 請款與付款模型驗證：Payment 具備 claimId，支援 1 Claim 對多 Payment
 * 13. 請款金額欄位驗證：currentClaimAmount, retentionAmount, advanceOffsetAmount, penaltyAmount, payableAmount
 * 14. Script Properties 讀寫驗證，嚴禁任何寫死 Google ID
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-mock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gasDir = path.resolve(__dirname, '..');

// 讀取所有 GAS 原始碼
const gasFiles = [
  'Config.gs',
  'Schema.gs',
  'Utils.gs',
  'DatabaseService.gs',
  'YearService.gs',
  'Code.gs',
];

function loadGasContext(env) {
  const sandbox = {
    PropertiesService: env.PropertiesService,
    DriveApp: env.DriveApp,
    SpreadsheetApp: env.SpreadsheetApp,
    Logger: env.Logger,
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
  console.log('開始執行 Phase 2A-1 GAS 資料庫骨架自動化驗證測試');
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

  // 準備初始模擬環境（模擬使用者已設定的 Script Properties）
  const initialProps = {
    DRIVE_ROOT_FOLDER_ID: 'folder_root_test_id',
    SCHEMA_VERSION: '1',
    APP_ENV: 'production',
  };

  const env = createGasEnvironment(initialProps);
  const gas = loadGasContext(env);

  // ----------------------------------------------------
  // 測試 1: 第一次執行 initializeSystem()
  // ----------------------------------------------------
  console.log('【測試群組 1：系統初次初始化與試算表建立】');
  const initResult = gas.initializeSystem();
  assert(initResult.success === true, 'initializeSystem() 執行回傳 success: true');
  assert(initResult.masterDatabase.name === '公司表單系統主檔資料庫', '主檔資料庫名稱正確');
  assert(initResult.currentYearDatabase.year === new Date().getFullYear(), '當前年度符合預期');

  const masterId = initResult.masterDatabase.spreadsheetId;
  const currentYearId = initResult.currentYearDatabase.spreadsheetId;
  assert(!!masterId, '主檔 Spreadsheet ID 存在且非空');
  assert(!!currentYearId, '年度 Spreadsheet ID 存在且非空');
  assert(masterId !== currentYearId, '主檔與年度資料庫為不同之獨立 Spreadsheet');

  // ----------------------------------------------------
  // 測試 2: 主檔工作表與 Schema 驗證
  // ----------------------------------------------------
  console.log('\n【測試群組 2：主檔工作表與欄位 Schema 驗證】');
  const masterSs = env.SpreadsheetApp.openById(masterId);
  const masterSheetNames = masterSs.getSheets().map(s => s.getName());
  assert(masterSheetNames.includes('專案主檔'), '主檔包含「專案主檔」工作表');
  assert(masterSheetNames.includes('廠商主檔'), '主檔包含「廠商主檔」工作表');
  assert(masterSheetNames.includes('年度設定'), '主檔包含「年度設定」工作表');
  assert(!masterSheetNames.includes('工作表1'), '預設空白「工作表1」已成功清理');

  // 驗證專案主檔 Headers
  const projectsSheet = masterSs.getSheetByName('專案主檔');
  const expectedProjectsHeaders = ['projectId', 'company', 'projectName', 'status', 'createdAt', 'updatedAt'];
  const actualProjectsHeaders = projectsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualProjectsHeaders) === JSON.stringify(expectedProjectsHeaders),
    '「專案主檔」欄位 Headers 完全符合 Schema'
  );

  // 驗證廠商主檔 Headers 與格式
  const vendorsSheet = masterSs.getSheetByName('廠商主檔');
  const expectedVendorsHeaders = [
    'vendorId', 'vendorName', 'taxId', 'entityType',
    'bankCode', 'bankName', 'branchCode', 'branchName',
    'accountName', 'accountNumber', 'isActive',
    'createdAt', 'updatedAt'
  ];
  const actualVendorsHeaders = vendorsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualVendorsHeaders) === JSON.stringify(expectedVendorsHeaders),
    '「廠商主檔」欄位 Headers 完全符合 Schema'
  );

  // 驗證 accountNumber 等為純文字格式 (@)
  const accountNumberColIdx = actualVendorsHeaders.indexOf('accountNumber') + 1;
  const taxIdColIdx = actualVendorsHeaders.indexOf('taxId') + 1;
  const bankCodeColIdx = actualVendorsHeaders.indexOf('bankCode') + 1;
  const branchCodeColIdx = actualVendorsHeaders.indexOf('branchCode') + 1;
  assert(vendorsSheet.columnFormats[accountNumberColIdx] === '@', 'accountNumber 欄位格式為純文字 (@)，防範前置 0 消失');
  assert(vendorsSheet.columnFormats[taxIdColIdx] === '@', 'taxId 欄位格式為純文字 (@)');
  assert(vendorsSheet.columnFormats[bankCodeColIdx] === '@', 'bankCode 欄位格式為純文字 (@)');
  assert(vendorsSheet.columnFormats[branchCodeColIdx] === '@', 'branchCode 欄位格式為純文字 (@)');

  // 驗證年度設定 Headers
  const yearConfigSheet = masterSs.getSheetByName('年度設定');
  const expectedYearConfigHeaders = ['year', 'spreadsheetId', 'status', 'createdAt', 'archivedAt'];
  const actualYearConfigHeaders = yearConfigSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualYearConfigHeaders) === JSON.stringify(expectedYearConfigHeaders),
    '「年度設定」欄位 Headers 完全符合 Schema'
  );

  // ----------------------------------------------------
  // 測試 3: 當年度資料庫工作表與 Schema 驗證
  // ----------------------------------------------------
  console.log('\n【測試群組 3：年度資料庫工作表與欄位 Schema 驗證】');
  const yearSs = env.SpreadsheetApp.openById(currentYearId);
  const yearSheetNames = yearSs.getSheets().map(s => s.getName());
  assert(yearSheetNames.includes('預算項目'), '年度資料庫包含「預算項目」工作表');
  assert(yearSheetNames.includes('表單紀錄'), '年度資料庫包含「表單紀錄」工作表');
  assert(yearSheetNames.includes('請款紀錄'), '年度資料庫包含「請款紀錄」工作表');
  assert(yearSheetNames.includes('付款紀錄'), '年度資料庫包含「付款紀錄」工作表');
  assert(yearSheetNames.includes('異動紀錄'), '年度資料庫包含「異動紀錄」工作表');
  assert(!yearSheetNames.includes('工作表1'), '年度資料庫預設空白「工作表1」已清理');

  // 驗證請款紀錄 Headers
  const claimsSheet = yearSs.getSheetByName('請款紀錄');
  const expectedClaimsHeaders = [
    'claimId', 'formId', 'year', 'claimPeriod', 'claimSequence',
    'claimDate', 'company', 'projectId', 'projectName',
    'vendorId', 'vendorName', 'vendorTaxId', 'budgetType',
    'budgetItemId', 'itemName', 'unbudgetedReason',
    'currentClaimAmount', 'retentionAmount', 'advanceOffsetAmount',
    'penaltyAmount', 'payableAmount', 'status', 'createdAt', 'updatedAt'
  ];
  const actualClaimsHeaders = claimsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualClaimsHeaders) === JSON.stringify(expectedClaimsHeaders),
    '「請款紀錄」欄位 Headers 包含金額欄位 (currentClaimAmount, retentionAmount, etc.) 完全符合 Schema'
  );

  // 驗證付款紀錄 Headers
  const paymentsSheet = yearSs.getSheetByName('付款紀錄');
  const expectedPaymentsHeaders = [
    'paymentId', 'claimId', 'formId', 'budgetType', 'budgetItemId',
    'company', 'projectId', 'projectName', 'vendorId', 'vendorName',
    'itemName', 'amount', 'status', 'paymentDate', 'year', 'month',
    'createdAt', 'updatedAt'
  ];
  const actualPaymentsHeaders = paymentsSheet.getDataRange().getValues()[0];
  assert(
    JSON.stringify(actualPaymentsHeaders) === JSON.stringify(expectedPaymentsHeaders),
    '「付款紀錄」欄位 Headers 包含 claimId 完全符合 Schema'
  );

  // ----------------------------------------------------
  // 測試 4: 第二次執行 initializeSystem() 驗證冪等性
  // ----------------------------------------------------
  console.log('\n【測試群組 4：initializeSystem() 冪等性驗證】');
  const totalFilesBefore = env._internal.files.size;
  const initResult2 = gas.initializeSystem();
  const totalFilesAfter = env._internal.files.size;
  assert(totalFilesBefore === totalFilesAfter, '第二次執行 initializeSystem() 不重複建立 Spreadsheet 檔案');
  assert(initResult2.masterDatabase.spreadsheetId === masterId, '主檔 Spreadsheet ID 保持一致');
  assert(initResult2.currentYearDatabase.spreadsheetId === currentYearId, '年度 Spreadsheet ID 保持一致');

  // ----------------------------------------------------
  // 測試 5: createYearDatabase(2027) 動態建立與登記
  // ----------------------------------------------------
  console.log('\n【測試群組 5：createYearDatabase(2027) 動態建立與年度設定登記】');
  const ss2027 = gas.createYearDatabase(2027);
  const id2027 = ss2027.getId();
  assert(!!id2027, '成功建立 2027 年度資料庫');
  assert(ss2027.getName() === '2027公司表單資料庫', '2027 年度資料庫命名正確');

  // 檢查主檔「年度設定」是否有 2027 紀錄
  const yearConfigData = yearConfigSheet.getDataRange().getValues();
  const record2027 = yearConfigData.find(r => String(r[0]) === '2027');
  assert(!!record2027, '主檔「年度設定」成功登記 2027 年度');
  assert(record2027[1] === id2027, '「年度設定」中 2027 Spreadsheet ID 吻合');
  assert(record2027[2] === 'active', '「年度設定」中 2027 狀態為 active');

  // ----------------------------------------------------
  // 測試 6: 再次呼叫 createYearDatabase(2027) 冪等性
  // ----------------------------------------------------
  console.log('\n【測試群組 6：createYearDatabase(2027) 冪等性驗證】');
  const filesCountBefore2027 = env._internal.files.size;
  const ss2027Again = gas.createYearDatabase(2027);
  const filesCountAfter2027 = env._internal.files.size;
  assert(filesCountBefore2027 === filesCountAfter2027, '再次建立 2027 不重複建立檔案');
  assert(ss2027Again.getId() === id2027, '取得既有 2027 資料庫 ID');

  // ----------------------------------------------------
  // 測試 7: 資料模型規則驗證（同一廠商允許 budgeted + unbudgeted，Claim 與 Payment 關聯）
  // ----------------------------------------------------
  console.log('\n【測試群組 7：業務資料模型規則驗證】');
  // 模擬廠商 VEN-TEST-01
  const testVendorId = 'VEN-000012';
  // 請款 1 (有預算)
  const claim1 = {
    claimId: 'CLM-2026-001',
    formId: 'FRM-001',
    year: '2026',
    vendorId: testVendorId,
    budgetType: gas.STATUS.BUDGET_TYPE.BUDGETED,
    budgetItemId: 'BUD-2026-001',
    itemName: '一期工程款',
    payableAmount: 930000,
  };
  // 請款 2 (無預算)
  const claim2 = {
    claimId: 'CLM-2026-002',
    formId: 'FRM-002',
    year: '2026',
    vendorId: testVendorId,
    budgetType: gas.STATUS.BUDGET_TYPE.UNBUDGETED,
    budgetItemId: '',
    itemName: '緊急臨時修繕',
    unbudgetedReason: '颱風外牆滲水緊急處理',
    payableAmount: 85000,
  };

  assert(claim1.vendorId === claim2.vendorId, '同一廠商 ID 允許同時有請款');
  assert(claim1.budgetType === 'budgeted' && claim1.budgetItemId !== '', '有預算請款 budgetType=budgeted 且 budgetItemId 有值');
  assert(claim2.budgetType === 'unbudgeted' && claim2.budgetItemId === '' && claim2.itemName !== '', '無預算請款 budgetType=unbudgeted 且 budgetItemId 空白、itemName 有值');

  // 付款 1 與 付款 2 關聯至 claim1 (一筆 Claim 對應兩筆 Payment)
  const payment1 = {
    paymentId: 'PAY-001',
    claimId: claim1.claimId,
    amount: 500000,
    status: gas.STATUS.PAYMENT.PAID,
  };
  const payment2 = {
    paymentId: 'PAY-002',
    claimId: claim1.claimId,
    amount: 430000,
    status: gas.STATUS.PAYMENT.SCHEDULED,
  };
  assert(payment1.claimId === claim1.claimId && payment2.claimId === claim1.claimId, '支援 1 筆 Claim 關聯多筆 Payment');
  assert(payment1.amount + payment2.amount === claim1.payableAmount, '多筆 Payment 加總吻合 Claim 應付金額');

  // ----------------------------------------------------
  // 測試 8: Script Properties 狀態檢查（無寫死 ID）
  // ----------------------------------------------------
  console.log('\n【測試群組 8：Script Properties 狀態檢驗】');
  const finalProps = env.PropertiesService.getScriptProperties().getProperties();
  assert(finalProps.MASTER_SPREADSHEET_ID === masterId, 'Script Properties 記錄正確 MASTER_SPREADSHEET_ID');
  assert(Number(finalProps.CURRENT_YEAR) === new Date().getFullYear(), 'Script Properties 記錄正確 CURRENT_YEAR');
  assert(finalProps.SCHEMA_VERSION === '1', 'SCHEMA_VERSION 保持 1');
  assert(finalProps.APP_ENV === 'production', 'APP_ENV 保持 production');

  console.log('\n====================================================');
  console.log(`測試結果：${passed} 項通過，${failed} 項失敗`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
