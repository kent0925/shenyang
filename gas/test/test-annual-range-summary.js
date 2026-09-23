import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-mock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['Config.gs', 'Schema.gs', 'Utils.gs', 'IdService.gs', 'ApiService.gs', 'DatabaseService.gs', 'YearService.gs', 'Code.gs'];
const env = createGasEnvironment({ DRIVE_ROOT_FOLDER_ID: 'root', CURRENT_YEAR: '2026', SCHEMA_VERSION: '1' });
const context = vm.createContext({ ...env, Date, console });
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const master = env.SpreadsheetApp.create('master');
env.PropertiesService.getScriptProperties().setProperty('MASTER_SPREADSHEET_ID', master.getId());
context.getMasterDatabase();

let passed = 0; let failed = 0;
const check = (condition, name) => {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}`);
  }
};
const codeOf = (fn) => {
  try {
    fn();
    return '';
  } catch (error) {
    return error.code || '';
  }
};

console.log('=== 年度自訂期別區間總表 12 項核心驗證 ===\n');

// 準備測試基礎主檔：專案、分案、預算項目、廠商
const projectA = context.handleSaveProject({ company: '昇陽建設', projectName: '信義A案' });
const subA1 = context.handleSaveSubProject({ projectId: projectA.projectId, subProjectName: '一期結構' });
const subA2 = context.handleSaveSubProject({ projectId: projectA.projectId, subProjectName: '二期機電' });

const vendor1 = context.handleSaveVendor({ vendorName: '宏國營造' });
const vendor2 = context.handleSaveVendor({ vendorName: '華新機電' });

const budgetA1 = context.handleSaveBudgetItem({
  year: 2026,
  projectId: projectA.projectId,
  company: projectA.company,
  projectName: projectA.projectName,
  subProjectId: subA1.subProjectId,
  itemName: '土方連續壁',
  vendorId: vendor1.vendorId,
  vendorName: vendor1.vendorName,
  budgetAmount: 10000000,
  status: 'active'
});

const budgetA2 = context.handleSaveBudgetItem({
  year: 2026,
  projectId: projectA.projectId,
  company: projectA.company,
  projectName: projectA.projectName,
  subProjectId: subA2.subProjectId,
  itemName: '電梯工程',
  vendorId: vendor2.vendorId,
  vendorName: vendor2.vendorName,
  budgetAmount: 5000000,
  status: 'active'
});

// 建立分佈於不同請款月份的請款單
// 1. 2026-02 請款（送件 2026-02-15，在 3~8 月區間外）
context.handleSaveForm({
  formType: 'payment_request',
  company: projectA.company,
  year: 2026,
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subA1.subProjectId,
  subProjectName: subA1.subProjectName,
  vendorId: vendor1.vendorId,
  vendorName: vendor1.vendorName,
  budgetType: 'budgeted',
  budgetItemId: budgetA1.budgetItemId,
  amount: 100000,
  status: 'submitted',
  payloadJson: JSON.stringify({ applyDate: '2026-02-15' })
});

// 2. 2026-03 請款（送件 2026-02-25，屬於 2026-03 期別：2026-02-21~2026-03-20）
context.handleSaveForm({
  formType: 'payment_request',
  company: projectA.company,
  year: 2026,
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subA1.subProjectId,
  subProjectName: subA1.subProjectName,
  vendorId: vendor1.vendorId,
  vendorName: vendor1.vendorName,
  budgetType: 'budgeted',
  budgetItemId: budgetA1.budgetItemId,
  amount: 300000,
  status: 'submitted',
  payloadJson: JSON.stringify({ applyDate: '2026-02-25', budgetItemName: budgetA1.itemName })
});

// 3. 2026-05 請款（送件 2026-05-10，屬於 2026-05 期別）
context.handleSaveForm({
  formType: 'payment_request',
  company: projectA.company,
  year: 2026,
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subA2.subProjectId,
  subProjectName: subA2.subProjectName,
  vendorId: vendor2.vendorId,
  vendorName: vendor2.vendorName,
  budgetType: 'budgeted',
  budgetItemId: budgetA2.budgetItemId,
  amount: 500000,
  status: 'paid',
  payloadJson: JSON.stringify({ applyDate: '2026-05-10', actualPaymentDate: '2026-06-15', budgetItemName: budgetA2.itemName })
});

// 4. 2026-08 請款（送件 2026-08-20，屬於 2026-08 期別：2026-07-21~2026-08-20）
context.handleSaveForm({
  formType: 'payment_request',
  company: projectA.company,
  year: 2026,
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subA1.subProjectId,
  subProjectName: subA1.subProjectName,
  vendorId: vendor1.vendorId,
  vendorName: vendor1.vendorName,
  budgetType: 'budgeted',
  budgetItemId: budgetA1.budgetItemId,
  amount: 200000,
  status: 'submitted',
  payloadJson: JSON.stringify({ applyDate: '2026-08-20', budgetItemName: budgetA1.itemName })
});

// 5. 2026-10 請款（送件 2026-10-15，在 3~8 月區間外）
context.handleSaveForm({
  formType: 'payment_request',
  company: projectA.company,
  year: 2026,
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subA2.subProjectId,
  subProjectName: subA2.subProjectName,
  vendorId: vendor2.vendorId,
  vendorName: vendor2.vendorName,
  budgetType: 'budgeted',
  budgetItemId: budgetA2.budgetItemId,
  amount: 400000,
  status: 'submitted',
  payloadJson: JSON.stringify({ applyDate: '2026-10-15', budgetItemName: budgetA2.itemName })
});

// 執行 12 項驗證：

// 1. 2026 全年度仍維持既有年度結果（未帶 startMonth/endMonth，預設 1~12 月）
const fullAnnual = context.handleGetAnnualBillingReport({ year: 2026 });
check(
  fullAnnual.totalAmount === (100000 + 300000 + 500000 + 200000 + 400000) &&
  fullAnnual.claimCount === 5 &&
  fullAnnual.monthlySummaries.length === 12,
  '1. 2026 全年度仍維持既有年度結果 (含 1~12 月完整 5 筆請款總和 150 萬)'
);

// 2. 2026/03～2026/08 只統計 2026-03～2026-08
const rangeReport = context.handleGetAnnualBillingReport({ year: 2026, startMonth: 3, endMonth: 8 });
check(
  rangeReport.totalAmount === (300000 + 500000 + 200000) &&
  rangeReport.claimCount === 3,
  '2. 2026/03～2026/08 只統計 2026-03～2026-08 期別 (排除 2 月 10 萬與 10 月 40 萬，總額 100 萬)'
);

// 3. 區間 Total = 選中月份 Monthly Totals 加總
const rangeMonthSum = rangeReport.monthlySummaries.reduce((sum, m) => sum + (m.totalAmount || 0), 0);
check(
  Math.abs(rangeReport.totalAmount - rangeMonthSum) < 0.001,
  '3. 區間 Total 嚴格等於選中月份 Monthly Totals 加總 (Range Total === Mar + Apr + May + Jun + Jul + Aug)'
);

// 4. Project 小計符合相同區間
const projectSubtotal = rangeReport.projectSubtotals.find((p) => p.name === projectA.projectName);
check(
  projectSubtotal && projectSubtotal.amount === 1000000,
  '4. Project 小計符合相同區間 (信義A案區間小計為 100 萬)'
);

// 5. SubProject 小計符合相同區間
const sub1Subtotal = rangeReport.subProjectSubtotals.find((s) => s.name === subA1.subProjectName);
const sub2Subtotal = rangeReport.subProjectSubtotals.find((s) => s.name === subA2.subProjectName);
check(
  sub1Subtotal && sub1Subtotal.amount === 500000 &&
  sub2Subtotal && sub2Subtotal.amount === 500000,
  '5. SubProject 小計符合相同區間 (一期結構 50 萬，二期機電 50 萬)'
);

// 6. BudgetItem 小計符合相同區間
const b1Subtotal = rangeReport.budgetItemSubtotals.find((b) => b.name === budgetA1.itemName);
const b2Subtotal = rangeReport.budgetItemSubtotals.find((b) => b.name === budgetA2.itemName);
check(
  b1Subtotal && b1Subtotal.amount === 500000 &&
  b2Subtotal && b2Subtotal.amount === 500000,
  '6. BudgetItem 小計符合相同區間 (土方連續壁 50 萬，電梯工程 50 萬)'
);

// 7. Vendor 小計符合相同區間
const v1Subtotal = rangeReport.vendorSubtotals.find((v) => v.name === vendor1.vendorName);
const v2Subtotal = rangeReport.vendorSubtotals.find((v) => v.name === vendor2.vendorName);
check(
  v1Subtotal && v1Subtotal.amount === 500000 &&
  v2Subtotal && v2Subtotal.amount === 500000,
  '7. Vendor 小計符合相同區間 (宏國營造 50 萬，華新機電 50 萬)'
);

// 8. 已付款／待付款符合相同區間
check(
  rangeReport.paidAmount === 500000 && rangeReport.unpaidAmount === 500000,
  '8. 已付款／待付款符合相同區間 (已付款 50 萬，待付款 50 萬)'
);

// 9. 月份 Drill-down 只顯示所選區間 (3, 4, 5, 6, 7, 8 月，共 6 個月份，不含 1~2 月與 9~12 月)
const monthNumbers = rangeReport.monthlySummaries.map((m) => m.month);
check(
  rangeReport.monthlySummaries.length === 6 &&
  JSON.stringify(monthNumbers) === JSON.stringify([3, 4, 5, 6, 7, 8]),
  '9. 月份 Drill-down 只顯示所選區間 (只有 3~8 月，不會仍顯示 1~12 月填 0)'
);

// 10. 開始月份 > 結束月份時被阻擋 (例如 9 月 -> 3 月)
const invalidCallError = codeOf(() => context.handleGetAnnualBillingReport({ year: 2026, startMonth: 9, endMonth: 3 }));
check(
  invalidCallError === 'VALIDATION_ERROR',
  '10. 開始月份 > 結束月份時被阻擋拋出 VALIDATION_ERROR'
);

// 11. 無資料區間正常顯示 0，不報錯 (例如 2026-11 ~ 2026-12 尚無請款)
const emptyRangeReport = context.handleGetAnnualBillingReport({ year: 2026, startMonth: 11, endMonth: 12 });
check(
  emptyRangeReport &&
  emptyRangeReport.totalAmount === 0 &&
  emptyRangeReport.claimCount === 0 &&
  emptyRangeReport.paidAmount === 0 &&
  emptyRangeReport.unpaidAmount === 0 &&
  emptyRangeReport.monthlySummaries.length === 2,
  '11. 無資料區間正常顯示 0，不報錯 (11~12 月總額 0、筆數 0、2 期正常列出)'
);

// 12. 2026-03 仍代表完整 Billing Period，而不是 3/1～3/31
const marchSummary = rangeReport.monthlySummaries.find((m) => m.month === 3);
check(
  marchSummary &&
  marchSummary.periodStart === '2026-02-21' &&
  marchSummary.periodEnd === '2026-03-20' &&
  marchSummary.totalAmount === 300000,
  '12. 2026-03 仍代表完整 Billing Period (2026-02-21 ～ 2026-03-20)，包含 2/25 的 30 萬請款，而非自然月 3/1~3/31'
);

console.log(`\n========================================`);
console.log(`年度自訂期別區間驗證: ${passed}/${passed + failed} PASS`);
console.log(`========================================\n`);

if (failed) process.exitCode = 1;
