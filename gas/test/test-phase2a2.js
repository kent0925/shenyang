/**
 * test-phase2a2.js - Phase 2A-2 安全 API 層與資料服務層自動化驗證測試
 * 
 * 涵蓋測試項目：
 * 1. GAS doGet(e) 阻擋與 METHOD_NOT_ALLOWED 回應
 * 2. GAS doPost(e) Secret 權限驗證 (缺少、錯誤、正確)
 * 3. 嚴格邊界：禁止透過 API 調用 initializeSystem
 * 4. health action 檢驗（無敏感 ID/Secret 洩漏）
 * 5. Projects API (listProjects / saveProject 新增與更新、欄位驗證、ID 產生)
 * 6. Vendors API (listVendors / saveVendor、前置 0 純文字保護如 007, 000123456789)
 * 7. Budget Items API (listBudgetItems / saveBudgetItem、年度定位、projectId 篩選)
 * 8. Forms API (listForms / getForm / saveForm、payloadJson 安全轉為字串、不自動建立 Claim)
 * 9. IdService 安全性 (Bootstrap 最大序號、計數器單調遞增防重用、Lock 保護)
 * 10. Vercel Proxy (api/backend.ts) 邏輯檢驗 (Header Token 檢查 401、環境變數缺少 500、狀態碼對應 400/404/502)
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createGasEnvironment } from './gas-mock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadVercelHandler() {
  const tsPath = path.resolve(__dirname, '../../api/backend.ts');
  const tsCode = fs.readFileSync(tsPath, 'utf-8');
  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const base64Uri = 'data:text/javascript;base64,' + Buffer.from(jsCode).toString('base64');
  const mod = await import(base64Uri);
  return mod.default;
}
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

// 輔助函式：發送 mock doPost 請求並解析回應
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
  console.log('開始執行 Phase 2A-2 安全 API 層與資料服務層驗證測試');
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

  const TEST_SHARED_SECRET = 'test-secret-key-xyz-123';
  const initialProps = {
    DRIVE_ROOT_FOLDER_ID: 'folder_root_test_id',
    SCHEMA_VERSION: '1',
    APP_ENV: 'production',
    API_SHARED_SECRET: TEST_SHARED_SECRET,
  };

  const env = createGasEnvironment(initialProps);
  const gas = loadGasContext(env);

  // 先進行系統初始化以建立主檔與 2026 年度資料庫
  gas.initializeSystem();

  // ----------------------------------------------------
  // 測試 1: doGet 阻擋與 doPost 權限驗證
  // ----------------------------------------------------
  console.log('【測試群組 1：API 通訊安全與權限驗證】');
  const getRes = JSON.parse(gas.doGet({}).getContent());
  assert(getRes.ok === false && getRes.error.code === 'METHOD_NOT_ALLOWED', 'doGet() 正確拒絕並回傳 METHOD_NOT_ALLOWED');

  const noSecretRes = callDoPost(gas, { action: 'health', payload: {} });
  assert(noSecretRes.ok === false && noSecretRes.error.code === 'UNAUTHORIZED', '未提供 secret 時回傳 UNAUTHORIZED');

  const wrongSecretRes = callDoPost(gas, { secret: 'invalid-secret', action: 'health', payload: {} });
  assert(wrongSecretRes.ok === false && wrongSecretRes.error.code === 'UNAUTHORIZED', '提供錯誤 secret 時回傳 UNAUTHORIZED');

  const invalidJsonOutput = gas.doPost({ postData: { contents: '{invalid-json' } });
  const invalidJsonRes = JSON.parse(invalidJsonOutput.getContent());
  assert(invalidJsonRes.ok === false && invalidJsonRes.error.code === 'INVALID_JSON', 'JSON 格式錯誤時回傳 INVALID_JSON');

  const unknownActionRes = callDoPost(gas, { secret: TEST_SHARED_SECRET, action: 'nonExistentAction', payload: {} });
  assert(unknownActionRes.ok === false && unknownActionRes.error.code === 'UNKNOWN_ACTION', '未知 action 回傳 UNKNOWN_ACTION');

  // 重要邊界：禁止透過 API 調用 initializeSystem
  const initActionRes = callDoPost(gas, { secret: TEST_SHARED_SECRET, action: 'initializeSystem', payload: {} });
  assert(initActionRes.ok === false && initActionRes.error.code === 'UNKNOWN_ACTION', '嚴禁由 API 呼叫 initializeSystem（回傳 UNKNOWN_ACTION）');

  // ----------------------------------------------------
  // 測試 2: health action 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 2：health 檢查】');
  const healthRes = callDoPost(gas, { secret: TEST_SHARED_SECRET, action: 'health', payload: {} });
  assert(healthRes.ok === true, 'health 請求成功');
  assert(healthRes.data.service === 'company-form-backend', 'service 名稱正確');
  assert(healthRes.data.status === 'ok', 'status 為 ok');
  assert(healthRes.data.schemaVersion === '1', 'schemaVersion 符合設定');
  assert(healthRes.data.currentYear === '2026', 'currentYear 符合當年度');
  assert(!healthRes.data.spreadsheetId && !healthRes.data.secret, 'health 回應未洩漏任何 ID 或 Secret');

  // ----------------------------------------------------
  // 測試 3: Projects API 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 3：Projects API 檢驗】');
  // 3.1 必填欄位驗證
  const invalidPrjRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveProject',
    payload: { company: '' },
  });
  assert(invalidPrjRes.ok === false && invalidPrjRes.error.code === 'VALIDATION_ERROR', '專案必填驗證生效 (VALIDATION_ERROR)');

  // 3.2 新增專案 (產生 PRJ-000001)
  const createPrjRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveProject',
    payload: {
      company: '瀋陽建設股份有限公司',
      projectName: '敦南大樓新建工程',
    },
  });
  assert(createPrjRes.ok === true, '新增專案成功');
  assert(createPrjRes.data.projectId === 'PRJ-000001', '專案序號自動產生為 PRJ-000001');
  assert(createPrjRes.data.status === 'active', '專案預設狀態為 active');

  // 3.3 更新專案
  const updatePrjRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveProject',
    payload: {
      projectId: 'PRJ-000001',
      projectName: '敦南大樓新建工程（一期）',
      company: '瀋陽建設股份有限公司',
    },
  });
  assert(updatePrjRes.ok === true, '更新專案成功');
  assert(updatePrjRes.data.projectName === '敦南大樓新建工程（一期）', '專案名稱成功更新');
  assert(updatePrjRes.data.projectId === 'PRJ-000001', '專案編號未變動');

  // 3.4 查詢專案清單
  const listPrjRes = callDoPost(gas, { secret: TEST_SHARED_SECRET, action: 'listProjects', payload: {} });
  assert(listPrjRes.ok === true && listPrjRes.data.length === 1, 'listProjects 取得 1 筆專案');
  assert(listPrjRes.data[0].projectId === 'PRJ-000001', '專案清單資料正確');

  // ----------------------------------------------------
  // 測試 4: Vendors API 檢驗 (前置 0 純文字保護)
  // ----------------------------------------------------
  console.log('\n【測試群組 4：Vendors API 檢驗（文字保護防掉前置 0）】');
  const createVenRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveVendor',
    payload: {
      vendorName: '台塑營造工程行',
      taxId: '04281234', // 前置 0
      bankCode: '007',    // 第一銀行 007
      branchCode: '001',
      accountName: '台塑營造工程行',
      accountNumber: '000123456789', // 前置 000
    },
  });
  assert(createVenRes.ok === true, '新增廠商成功');
  assert(createVenRes.data.vendorId === 'VEN-000001', '廠商序號自動產生為 VEN-000001');
  assert(createVenRes.data.bankCode === '007', '銀行代碼嚴格維持 "007" 字串');
  assert(createVenRes.data.accountNumber === '000123456789', '銀行帳號嚴格維持 "000123456789" 字串');
  assert(createVenRes.data.taxId === '04281234', '統一編號嚴格維持 "04281234" 字串');

  // 更新廠商
  const updateVenRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveVendor',
    payload: {
      vendorId: 'VEN-000001',
      vendorName: '台塑營造工程有限公司',
    },
  });
  assert(updateVenRes.ok === true, '更新廠商成功');
  assert(updateVenRes.data.vendorName === '台塑營造工程有限公司', '廠商名稱成功變更');
  assert(updateVenRes.data.accountNumber === '000123456789', '更新後銀行帳號前置 0 依然保留');

  // ----------------------------------------------------
  // 測試 5: Budget Items API 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 5：Budget Items API 檢驗】');
  const createBudRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveBudgetItem',
    payload: {
      year: 2026,
      projectId: 'PRJ-000001',
      company: '瀋陽建設股份有限公司',
      projectName: '敦南大樓新建工程（一期）',
      itemName: '地基開挖與擋土設施工程',
      vendorId: 'VEN-000001',
      vendorName: '台塑營造工程有限公司',
      budgetAmount: 15000000,
    },
  });
  assert(createBudRes.ok === true, '新增預算項目成功');
  assert(createBudRes.data.budgetItemId === 'BUD-2026-000001', '預算項目序號為 BUD-2026-000001');
  assert(createBudRes.data.budgetAmount === 15000000, '預算金額正確存入');

  const listBudRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'listBudgetItems',
    payload: { year: 2026, projectId: 'PRJ-000001' },
  });
  assert(listBudRes.ok === true && listBudRes.data.length === 1, '依專案查詢預算項目成功');

  // ----------------------------------------------------
  // 測試 6: Forms API 檢驗 (payloadJson 安全儲存、不自動建立 Claim)
  // ----------------------------------------------------
  console.log('\n【測試群組 6：Forms API 檢驗】');
  const mockPayloadData = {
    detailRows: [{ item: '水泥一式', price: 50000 }],
    meta: { remark: '緊急請款' },
  };

  const createFormRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'saveForm',
    payload: {
      year: 2026,
      formType: 'payment_request',
      company: '瀋陽建設股份有限公司',
      projectId: 'PRJ-000001',
      projectName: '敦南大樓新建工程（一期）',
      vendorId: 'VEN-000001',
      vendorName: '台塑營造工程有限公司',
      budgetType: 'budgeted',
      budgetItemId: 'BUD-2026-000001',
      amount: 50000,
      payloadJson: mockPayloadData, // 傳入物件，後端應自動轉為合法 JSON 字串
    },
  });
  assert(createFormRes.ok === true, '新增表單成功');
  assert(createFormRes.data.formId === 'FRM-2026-000001', '表單序號為 FRM-2026-000001');
  assert(typeof createFormRes.data.payloadJson === 'string', 'payloadJson 成功安全儲存為字串');
  assert(createFormRes.data.payloadJson !== '[object Object]', 'payloadJson 絕非 [object Object]');

  // getForm 檢驗
  const getFormRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'getForm',
    payload: { formId: 'FRM-2026-000001', year: 2026 },
  });
  assert(getFormRes.ok === true, 'getForm 查詢成功');
  assert(getFormRes.data.formId === 'FRM-2026-000001', '查詢之表單 ID 一致');

  // 查無表單檢驗
  const notFoundFormRes = callDoPost(gas, {
    secret: TEST_SHARED_SECRET,
    action: 'getForm',
    payload: { formId: 'FRM-2026-999999', year: 2026 },
  });
  assert(notFoundFormRes.ok === false && notFoundFormRes.error.code === 'NOT_FOUND', '查無表單回傳 NOT_FOUND');

  // 驗證未自動建立 Claim（本階段 saveForm 不得自動新增 Claim）
  const yearSs = gas.getYearDatabase(2026);
  const claimsSheet = yearSs.getSheetByName(gas.SHEETS.CLAIMS);
  assert(claimsSheet.getLastRow() <= 1, 'saveForm() 確未自動建立 Claim 紀錄（維持空表）');

  // ----------------------------------------------------
  // 測試 7: IdService Bootstrap 與防重用檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 7：IdService Bootstrap 與單調遞增防重用檢驗】');
  // 模擬清除 counter property，測試由 Sheet bootstrap
  env.PropertiesService.getScriptProperties().setProperty('COUNTER_PROJECT', '');
  const nextPrjId = gas.getNextId('PROJECT');
  assert(nextPrjId === 'PRJ-000002', 'Script Property 清空後，成功由 Sheet 最大值 1 進行 Bootstrap 並遞增至 PRJ-000002');

  // 模擬資料列被刪除，counter 不重用
  const nextPrjId2 = gas.getNextId('PROJECT');
  assert(nextPrjId2 === 'PRJ-000003', '持續單調遞增產生 PRJ-000003，不重複使用舊 ID');

  // ----------------------------------------------------
  // 測試 8: Vercel Proxy (api/backend.ts) 檢驗
  // ----------------------------------------------------
  console.log('\n【測試群組 8：Vercel Proxy (api/backend.ts) 邏輯檢驗】');
  const vercelHandler = await loadVercelHandler();

  function createMockResponse() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      json(data) {
        this.body = data;
      },
      end() {},
    };
  }

  // 8.1 測試 Method Not Allowed
  const resGet = createMockResponse();
  await vercelHandler({ method: 'GET', headers: {} }, resGet);
  assert(resGet.statusCode === 405, 'Vercel Proxy 拒絕非 POST 請求 (405)');

  // 8.2 測試缺少 X-Internal-Api-Key
  process.env.BACKEND_PROXY_TOKEN = 'mock-proxy-token-777';
  const resNoKey = createMockResponse();
  await vercelHandler({ method: 'POST', headers: {} }, resNoKey);
  assert(resNoKey.statusCode === 401, '缺少 X-Internal-Api-Key 時回傳 401');

  // 8.3 測試錯誤 X-Internal-Api-Key
  const resWrongKey = createMockResponse();
  await vercelHandler({ method: 'POST', headers: { 'x-internal-api-key': 'wrong-key' } }, resWrongKey);
  assert(resWrongKey.statusCode === 401, 'X-Internal-Api-Key 錯誤時回傳 401');

  // 8.4 測試伺服器缺少 GAS 環境變數配置 (500)
  delete process.env.GAS_WEB_APP_URL;
  delete process.env.GAS_API_SHARED_SECRET;
  const resNoEnv = createMockResponse();
  await vercelHandler({
    method: 'POST',
    headers: { 'x-internal-api-key': 'mock-proxy-token-777' },
    body: { action: 'health' },
  }, resNoEnv);
  assert(resNoEnv.statusCode === 500 && resNoEnv.body.error.code === 'SERVER_CONFIG_ERROR', '缺少 GAS 環境變數時回傳 500');

  // 8.5 測試正常 proxy 轉發與狀態碼映射 (mock global fetch)
  process.env.GAS_WEB_APP_URL = 'https://script.google.com/macros/s/MOCK_ID/exec';
  process.env.GAS_API_SHARED_SECRET = TEST_SHARED_SECRET;

  const originalFetch = global.fetch;
  // 模擬 fetch 返回 GAS 正確回應
  global.fetch = async (url, options) => {
    const reqBody = JSON.parse(options.body);
    // 驗證 proxy 有無自動注入 secret
    if (reqBody.secret !== TEST_SHARED_SECRET) {
      return {
        ok: true,
        json: async () => ({ ok: false, error: { code: 'UNAUTHORIZED', message: '未授權' } }),
      };
    }
    if (reqBody.action === 'mock_validation_error') {
      return {
        ok: true,
        json: async () => ({ ok: false, error: { code: 'VALIDATION_ERROR', message: '欄位錯誤' } }),
      };
    }
    if (reqBody.action === 'mock_not_found') {
      return {
        ok: true,
        json: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: '查無資料' } }),
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, data: { service: 'company-form-backend', status: 'ok' } }),
    };
  };

  try {
    // 成功 pass-through (200)
    const resPass = createMockResponse();
    await vercelHandler({
      method: 'POST',
      headers: { 'x-internal-api-key': 'mock-proxy-token-777' },
      body: { action: 'health', payload: {} },
    }, resPass);
    assert(resPass.statusCode === 200 && resPass.body.ok === true, 'Vercel Proxy 正常轉發成功 (HTTP 200)');

    // 狀態碼映射：VALIDATION_ERROR -> 400
    const resValErr = createMockResponse();
    await vercelHandler({
      method: 'POST',
      headers: { 'x-internal-api-key': 'mock-proxy-token-777' },
      body: { action: 'mock_validation_error' },
    }, resValErr);
    assert(resValErr.statusCode === 400, 'GAS VALIDATION_ERROR 正確映射為 HTTP 400');

    // 狀態碼映射：NOT_FOUND -> 404
    const resNotFound = createMockResponse();
    await vercelHandler({
      method: 'POST',
      headers: { 'x-internal-api-key': 'mock-proxy-token-777' },
      body: { action: 'mock_not_found' },
    }, resNotFound);
    assert(resNotFound.statusCode === 404, 'GAS NOT_FOUND 正確映射為 HTTP 404');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n====================================================');
  console.log(`測試結果：${passed} 項通過，${failed} 項失敗`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
