/**
 * test-phase2b-3cd-budget.js - Phase 2B-3C/D GAS 後端請款預算權威防線與併發鎖自動化驗證
 *
 * 涵蓋測試項目：
 * B1: BudgetItem 不存在拋出 NOT_FOUND
 * B2: 請款專案 ID 與預算項目所屬專案不符拋出 VALIDATION_ERROR
 * B3: 預算項目指定廠商 ID 與請款廠商不一致拋出 VALIDATION_ERROR
 * B4: 請款金額為 NaN 或負數時拋出 VALIDATION_ERROR
 * B5: 預算額度充足時正常儲存並更新表單
 * B6: 本次請款超出可用預算時拒絕儲存並拋出 VALIDATION_ERROR
 * B7: 預算項目包含終止金額時，以 (budgetAmount - terminatedAmount) 為上限計算超額
 * B8: 編輯更新既有表單時，排除自身歷史金額累計（防止假性超額）
 * B9: LockService 併發鎖正常調用 (waitLock / releaseLock)
 * B10: budgetType = 'unbudgeted' 表單略過預算檢查，正常儲存
 * B11: formType = 'seal_approval' 表單略過預算檢查，正常儲存
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

function callDoPost(gas, bodyObj) {
  const e = {
    postData: {
      contents: JSON.stringify(bodyObj),
    },
  };
  const output = gas.doPost(e);
  return JSON.parse(output.getContent());
}

async function runTests() {
  console.log('====================================================');
  console.log('開始執行 Phase 2B-3C/D GAS 後端預算防線與併發鎖 Targeted Tests');
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

  const TEST_SHARED_SECRET = 'test-secret-phase2b-3cd';
  const initialProps = {
    DRIVE_ROOT_FOLDER_ID: 'folder_root_test_id',
    SCHEMA_VERSION: '1',
    APP_ENV: 'production',
    API_SHARED_SECRET: TEST_SHARED_SECRET,
  };

  // 監控 LockService 調用次數
  let lockAcquiredCount = 0;
  let lockReleasedCount = 0;

  const env = createGasEnvironment(initialProps);
  
  // 覆寫 LockService 以便驗證併發鎖
  const originalLockService = env.LockService;
  env.LockService = {
    ...originalLockService,
    getScriptLock: () => ({
      waitLock: (timeout) => {
        lockAcquiredCount++;
      },
      releaseLock: () => {
        lockReleasedCount++;
      },
    }),
  };

  const gas = loadGasContext(env);
  gas.initializeSystem();

  // 1. 建立測試專案與廠商
  const projRes = callDoPost(gas, {
    action: 'saveProject',
    secret: TEST_SHARED_SECRET,
    payload: {
      company: '昇陽開發實業股份有限公司',
      projectName: '台北A案',
      status: 'active',
    },
  });
  assert(projRes.ok === true, '建立測試專案成功');
  const testProjectId = projRes.data.projectId;

  const vendRes = callDoPost(gas, {
    action: 'saveVendor',
    secret: TEST_SHARED_SECRET,
    payload: {
      vendorName: '台泥股份有限公司',
      taxId: '12345678',
      bankCode: '007',
      bankName: '第一銀行',
      accountNumber: '000123456789',
      isActive: true,
    },
  });
  assert(vendRes.ok === true, '建立測試廠商成功');
  const testVendorId = vendRes.data.vendorId;

  // 2. 建立測試預算項目 (原預算 100 萬，終止 10 萬，有效預算 90 萬，指定台泥)
  const budgetRes = callDoPost(gas, {
    action: 'saveBudgetItem',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      projectId: testProjectId,
      company: '昇陽開發實業股份有限公司',
      projectName: '台北A案',
      itemName: '混凝土結構工程',
      vendorId: testVendorId,
      vendorName: '台泥股份有限公司',
      budgetAmount: 1000000,
      terminatedAmount: 100000,
      status: 'active',
    },
  });
  assert(budgetRes.ok === true, '建立測試預算項目成功');
  const testBudgetItemId = budgetRes.data.budgetItemId;

  // ----------------------------------------------------
  // B1: BudgetItem 不存在拋出 NOT_FOUND
  // ----------------------------------------------------
  console.log('\n【測試 B1：預算項目不存在檢查】');
  const b1Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: 'BGT-NON-EXISTENT',
      amount: 50000,
      payloadJson: '{}',
    },
  });
  assert(b1Res.ok === false && b1Res.error.code === 'NOT_FOUND', 'B1: 預算項目不存在時正確拒絕並回傳 NOT_FOUND');

  // ----------------------------------------------------
  // B2: 專案 ID 與預算項目不符拋出 VALIDATION_ERROR
  // ----------------------------------------------------
  console.log('\n【測試 B2：專案關聯一致性檢查】');
  const b2Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: 'PRJ-MISMATCHED',
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 50000,
      payloadJson: '{}',
    },
  });
  assert(b2Res.ok === false && b2Res.error.code === 'VALIDATION_ERROR', 'B2: 專案 ID 不符時正確拒絕並回傳 VALIDATION_ERROR');

  // ----------------------------------------------------
  // R1: budgeted + budgetItemId + missing projectId 必須拒絕
  // ----------------------------------------------------
  console.log('\n【測試 R1：有預算但缺少 projectId 檢查】');
  const r1Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: '', // 故意留空
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 50000,
      payloadJson: '{}',
    },
  });
  assert(r1Res.ok === false && r1Res.error.code === 'VALIDATION_ERROR' && r1Res.error.message.includes('有預算請款必須提供專案編號'), 'R1: 有預算但缺少 projectId 正確被拒絕並回傳 VALIDATION_ERROR');

  // ----------------------------------------------------
  // R6: budgeted + 缺少 budgetItemId 必須拒絕，不得繞過預算防線
  // ----------------------------------------------------
  console.log('\n【測試 R6：有預算但缺少預算項目編號檢查】');
  const r6Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: '', // 故意留空
      amount: 50000,
      payloadJson: '{}',
    },
  });
  assert(r6Res.ok === false && r6Res.error.code === 'VALIDATION_ERROR' && r6Res.error.message.includes('有預算請款必須提供預算項目編號'), 'R6: 有預算但缺少 budgetItemId 正確被拒絕並回傳 VALIDATION_ERROR');

  // ----------------------------------------------------
  // B3: 廠商 ID 與預算項目指定廠商不一致拋出 VALIDATION_ERROR
  // ----------------------------------------------------
  console.log('\n【測試 B3：指定承攬廠商一致性檢查】');
  const b3Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: 'VND-DIFFERENT',
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 50000,
      payloadJson: '{}',
    },
  });
  assert(b3Res.ok === false && b3Res.error.code === 'VALIDATION_ERROR', 'B3: 廠商與預算項目指定廠商不符時正確拒絕');

  // ----------------------------------------------------
  // B4: 請款金額非法時拋出 VALIDATION_ERROR
  // ----------------------------------------------------
  console.log('\n【測試 B4：請款金額數值有效性檢查】');
  const b4Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: -1000,
      payloadJson: '{}',
    },
  });
  assert(b4Res.ok === false && b4Res.error.code === 'VALIDATION_ERROR', 'B4: 負數金額正確拒絕');

  // ----------------------------------------------------
  // B5: 預算充足時正常儲存 (第一筆 50 萬)
  // ----------------------------------------------------
  console.log('\n【測試 B5：預算充足時正常儲存】');
  const beforeLockAcquired = lockAcquiredCount;
  const beforeLockReleased = lockReleasedCount;

  const b5Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 500000,
      payloadJson: '{"desc":"第一期款"}',
    },
  });
  assert(b5Res.ok === true && b5Res.data.formId, 'B5: 預算充足時成功儲存表單');
  const form1Id = b5Res.data.formId;

  // ----------------------------------------------------
  // B9: LockService 併發鎖驗證
  // ----------------------------------------------------
  assert(lockAcquiredCount > beforeLockAcquired, 'B9.1: 有預算請款儲存調用了 LockService.waitLock');
  assert(lockReleasedCount > beforeLockReleased, 'B9.2: 儲存完畢後釋放了 LockService.releaseLock');

  // ----------------------------------------------------
  // R5: LockService 逾時/失敗回傳 INTERNAL_ERROR
  // ----------------------------------------------------
  console.log('\n【測試 R5：LockService 異常錯誤碼合約檢核】');
  const normalLockGetter = env.LockService.getScriptLock;
  env.LockService.getScriptLock = () => ({
    waitLock: () => { throw new Error('Lock timeout'); },
    releaseLock: () => {},
  });

  const r5Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 10000,
      payloadJson: '{}',
    },
  });
  assert(r5Res.ok === false && r5Res.error.code === 'INTERNAL_ERROR', 'R5: LockService 失敗時正確回傳 INTERNAL_ERROR');
  env.LockService.getScriptLock = normalLockGetter;

  // ----------------------------------------------------
  // B6: 超出預算上限時拋出 VALIDATION_ERROR
  // (有效預算 90 萬，已用 50 萬，剩餘 40 萬，嘗試申請 45 萬 -> 超額 5 萬)
  // ----------------------------------------------------
  console.log('\n【測試 B6：超出剩餘預算拒絕儲存】');
  const b6Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 450000,
      payloadJson: '{"desc":"超額款項"}',
    },
  });
  assert(b6Res.ok === false && b6Res.error.code === 'VALIDATION_ERROR', 'B6: 超額請款被權威防線精準攔截');
  assert(b6Res.error.message.includes('本次請款將超過可用預算'), 'B6: 包含清晰的預算超額說明');

  // ----------------------------------------------------
  // B7: 剛好在剩餘預算額度內 (申請 40 萬 -> 累計 90 萬，剛好等於有效預算)
  // ----------------------------------------------------
  console.log('\n【測試 B7：滿額請款 (等於有效預算)】');
  const b7Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 400000,
      payloadJson: '{"desc":"滿額款項"}',
    },
  });
  assert(b7Res.ok === true, 'B7: 滿額請款（剛好 90 萬）允許儲存');
  const form2Id = b7Res.data.formId;

  // ----------------------------------------------------
  // B8: 編輯既有表單排除自身金額 (更新 form1: 50萬 改為 45萬)
  // 此時若未排除自身，已用 50+40 = 90萬，加 45萬 會假性超額。
  // 排除自身後，已用 40萬，加 45萬 = 85萬 <= 90萬，應成功更新！
  // ----------------------------------------------------
  console.log('\n【測試 B8：更新表單排除自身歷史金額累計】');
  const b8Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      formId: form1Id,
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      projectId: testProjectId,
      vendorId: testVendorId,
      budgetType: 'budgeted',
      budgetItemId: testBudgetItemId,
      amount: 450000, // 50 萬降為 45 萬
      payloadJson: '{"desc":"第一期款修正為45萬"}',
    },
  });
  assert(b8Res.ok === true && b8Res.data.formId === form1Id, 'B8: 更新既有表單成功排除自身，無假性超額');

  // ----------------------------------------------------
  // B10: budgetType = 'unbudgeted' 略過預算限制
  // ----------------------------------------------------
  console.log('\n【測試 B10：無預算請款單略過預算檢查】');
  const b10Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'payment_request',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      budgetType: 'unbudgeted',
      amount: 99999999,
      payloadJson: '{"desc":"專案外無預算支出"}',
    },
  });
  assert(b10Res.ok === true, 'B10: unbudgeted 表單正常儲存不受預算項目限制');

  // ----------------------------------------------------
  // B11: seal_approval 表單略過預算檢查
  // ----------------------------------------------------
  console.log('\n【測試 B11：用印簽呈表單不檢查預算】');
  const b11Res = callDoPost(gas, {
    action: 'saveForm',
    secret: TEST_SHARED_SECRET,
    payload: {
      year: 2026,
      formType: 'seal_approval',
      status: 'submitted',
      company: '昇陽開發實業股份有限公司',
      payloadJson: '{"subject":"合約用印"}',
    },
  });
  assert(b11Res.ok === true, 'B11: seal_approval 表單正常儲存不受預算限制');

  console.log(`\n====================================================`);
  console.log(`Phase 2B-3C/D GAS 預算防線測試完成：${passed} 通過，${failed} 失敗`);
  console.log(`====================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('測試過程發生未捕獲之異常:', err);
  process.exit(1);
});

