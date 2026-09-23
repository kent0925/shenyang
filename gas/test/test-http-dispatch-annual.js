import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-mock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['Config.gs', 'Schema.gs', 'Utils.gs', 'IdService.gs', 'ApiService.gs', 'DatabaseService.gs', 'YearService.gs', 'Code.gs'];
const env = createGasEnvironment({ DRIVE_ROOT_FOLDER_ID: 'root', CURRENT_YEAR: '2026', SCHEMA_VERSION: '1', API_SHARED_SECRET: 'test_secret_123' });
const context = vm.createContext({ ...env, Date, console });
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });

const master = env.SpreadsheetApp.create('master');
env.PropertiesService.getScriptProperties().setProperty('MASTER_SPREADSHEET_ID', master.getId());
context.getMasterDatabase();

const secret = 'test_secret_123';

console.log('=== 驗證 GAS doPost router 分派 handleGetAnnualBillingReport ===\n');

// 1. 全年度 request (只有 year)
const reqFull = {
  postData: {
    contents: JSON.stringify({
      secret: secret,
      action: 'getAnnualBillingReport',
      payload: { year: 2026 }
    })
  }
};
const resFullOutput = context.doPost(reqFull);
const resFull = JSON.parse(resFullOutput.getContent());
console.log('1. 全年度請求 (year: 2026):');
console.log('   ok:', resFull.ok);
if (resFull.ok) {
  console.log('   year:', resFull.data.year, 'startMonth:', resFull.data.startMonth, 'endMonth:', resFull.data.endMonth);
  console.log('   monthlySummaries count:', resFull.data.monthlySummaries.length);
} else {
  console.log('   error:', resFull.error);
}
if (!resFull.ok || resFull.data.startMonth !== 1 || resFull.data.endMonth !== 12 || resFull.data.monthlySummaries.length !== 12) {
  console.error('[FAIL] 全年度請求未正確進入 handler 或回應錯誤');
  process.exit(1);
}
console.log('   [PASS] 成功進入 handleGetAnnualBillingReport 並回傳 1~12 月報表\n');

// 2. 自訂區間 request (3~8 月)
const reqRange = {
  postData: {
    contents: JSON.stringify({
      secret: secret,
      action: 'getAnnualBillingReport',
      payload: { year: 2026, startMonth: 3, endMonth: 8 }
    })
  }
};
const resRangeOutput = context.doPost(reqRange);
const resRange = JSON.parse(resRangeOutput.getContent());
console.log('2. 自訂區間請求 (2026/03 ~ 2026/08):');
console.log('   ok:', resRange.ok);
if (resRange.ok) {
  console.log('   year:', resRange.data.year, 'startMonth:', resRange.data.startMonth, 'endMonth:', resRange.data.endMonth);
  console.log('   monthlySummaries count:', resRange.data.monthlySummaries.length);
} else {
  console.log('   error:', resRange.error);
}
if (!resRange.ok || resRange.data.startMonth !== 3 || resRange.data.endMonth !== 8 || resRange.data.monthlySummaries.length !== 6) {
  console.error('[FAIL] 自訂區間請求未正確分派');
  process.exit(1);
}
console.log('   [PASS] 成功回傳 3~8 月報表 (共 6 個月份)\n');

// 3. 無效區間 (8 > 3) 應回傳 VALIDATION_ERROR，而不是 UNKNOWN_ACTION
const reqInvalid = {
  postData: {
    contents: JSON.stringify({
      secret: secret,
      action: 'getAnnualBillingReport',
      payload: { year: 2026, startMonth: 8, endMonth: 3 }
    })
  }
};
const resInvalidOutput = context.doPost(reqInvalid);
const resInvalid = JSON.parse(resInvalidOutput.getContent());
console.log('3. 無效區間防呆 (startMonth: 8 > endMonth: 3):');
console.log('   ok:', resInvalid.ok);
console.log('   error code:', resInvalid.error.code);
console.log('   error message:', resInvalid.error.message);
if (resInvalid.ok || resInvalid.error.code !== 'VALIDATION_ERROR') {
  console.error('[FAIL] 未回傳 VALIDATION_ERROR');
  process.exit(1);
}
console.log('   [PASS] 正確回傳 VALIDATION_ERROR，而非 UNKNOWN_ACTION\n');

console.log('========================================');
console.log('GAS doPost router 整合驗證: ALL PASS');
console.log('========================================');
