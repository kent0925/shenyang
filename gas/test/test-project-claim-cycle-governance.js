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
const check = (condition, name) => { if (condition) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.error(`[FAIL] ${name}`); } };
const codeOf = (fn) => { try { fn(); return ''; } catch (error) { return error.code || ''; } };

const project = context.handleSaveProject({ company: '測試公司', projectName: '測試專案' });
const sub = context.handleSaveSubProject({ projectId: project.projectId, subProjectName: '第一分案' });
check(codeOf(() => context.handleSaveProject({ ...project, status: 'closed' })) === 'VALIDATION_ERROR', 'Project with active SubProject cannot close');

const budget = context.handleSaveBudgetItem({ year: 2026, projectId: project.projectId, company: 'spoofed', projectName: 'spoofed', subProjectId: sub.subProjectId, itemName: '場租', budgetAmount: 1000, status: 'active' });
check(budget.company === project.company && budget.projectName === project.projectName, 'Budget uses authoritative Project snapshot');
check(codeOf(() => context.handleSaveSubProject({ subProjectId: sub.subProjectId, projectId: project.projectId, subProjectName: sub.subProjectName, status: 'closed' })) === 'VALIDATION_ERROR', 'SubProject with active BudgetItem cannot close');

context.handleSaveBudgetItem({ ...budget, projectId: project.projectId, company: project.company, projectName: project.projectName, subProjectId: sub.subProjectId, status: 'closed' });
const closedSub = context.handleSaveSubProject({ subProjectId: sub.subProjectId, projectId: project.projectId, subProjectName: sub.subProjectName, status: 'closed' });
check(closedSub.status === 'closed', 'SubProject can close after all BudgetItems close even with unused budget');
const closedProject = context.handleSaveProject({ ...project, status: 'closed' });
check(closedProject.status === 'closed', 'Project can close after all SubProjects close');
check(codeOf(() => context.handleSaveSubProject({ projectId: project.projectId, subProjectName: '禁止新增' })) === 'VALIDATION_ERROR', 'Closed Project cannot create SubProject');
check(codeOf(() => context.handleSaveSubProject({ subProjectId: sub.subProjectId, projectId: project.projectId, subProjectName: sub.subProjectName, status: 'active' })) === 'VALIDATION_ERROR', 'Closed Project cannot reactivate SubProject');
check(codeOf(() => context.handleSaveBudgetItem({ year: 2026, projectId: project.projectId, company: project.company, projectName: project.projectName, subProjectId: sub.subProjectId, itemName: '禁止新增', budgetAmount: 1 })) === 'VALIDATION_ERROR', 'Closed hierarchy cannot create BudgetItem');

context.handleSaveProject({ ...project, status: 'active' });
context.handleSaveSubProject({ subProjectId: sub.subProjectId, projectId: project.projectId, subProjectName: sub.subProjectName, status: 'active' });
const reopenedBudget = context.handleSaveBudgetItem({ ...budget, projectId: project.projectId, company: project.company, projectName: project.projectName, subProjectId: sub.subProjectId, status: 'active' });
const otherProject = context.handleSaveProject({ company: '測試公司', projectName: '其他專案' });
const otherSub = context.handleSaveSubProject({ projectId: otherProject.projectId, subProjectName: '其他分案' });

const basePayment = { formType: 'payment_request', company: project.company, year: 2026, projectId: project.projectId, projectName: project.projectName, subProjectId: sub.subProjectId, subProjectName: sub.subProjectName, vendorId: '', vendorName: '廠商', budgetType: 'budgeted', budgetItemId: reopenedBudget.budgetItemId, amount: 100, status: 'submitted', payloadJson: JSON.stringify({ applyDate: '2026-09-20' }) };
check(codeOf(() => context.handleSaveForm({ ...basePayment, subProjectId: otherSub.subProjectId })) === 'VALIDATION_ERROR', 'Budgeted Payment rejects BudgetItem from another SubProject');

// 測試 1: 2026-09-20 屬於 9 月請款（上月 21 ~ 本月 20）
const payment = context.handleSaveForm(basePayment);
check(payment.claimPeriodKey === '2026-09' && payment.periodStart === '2026-08-21' && payment.periodEnd === '2026-09-20' && payment.submissionDate === '2026-09-20' && payment.expectedPaymentDate === '2026-10-15', 'Default 21~20 cycle Snapshot is correct (2026-09-20 -> 2026-09)');

// 測試 2: 2026-09-21 屬於 10 月請款
const paymentSep21 = context.handleSaveForm({ ...basePayment, amount: 50, payloadJson: JSON.stringify({ applyDate: '2026-09-21' }) });
check(paymentSep21.claimPeriodKey === '2026-10' && paymentSep21.periodStart === '2026-09-21' && paymentSep21.periodEnd === '2026-10-20' && paymentSep21.submissionDate === '2026-10-20' && paymentSep21.expectedPaymentDate === '2026-11-15', 'Default 21~20 cycle Snapshot is correct (2026-09-21 -> 2026-10)');

// 測試 3: 跨年判定：2025-12-25 屬於 2026 年 1 月請款，歸屬 2026 年度
const paymentCrossYear = context.handleSaveForm({ ...basePayment, amount: 70, payloadJson: JSON.stringify({ applyDate: '2025-12-25' }) });
check(paymentCrossYear.claimPeriodKey === '2026-01' && paymentCrossYear.periodStart === '2025-12-21' && paymentCrossYear.periodEnd === '2026-01-20' && paymentCrossYear.year === 2026, 'Cross-year claim belongs to 2026-01 Period and 2026 Year');

// 測試 4: 生效新規則後，已存在請款單 Snapshot 永久鎖定不變
context.handleSaveBillingCycleRule({ effectiveFrom: '2026-10-01', cutoffDay: 20, submissionDay: 25, paymentMonthOffset: 1, paymentDay: 20 });
const edited = context.handleSaveForm({ ...basePayment, formId: payment.formId, expectedVersion: payment.version, amount: 120, payloadJson: JSON.stringify({ applyDate: '2026-09-20' }) });
check(edited.claimPeriodKey === '2026-09' && edited.submissionDate === '2026-09-20' && edited.expectedPaymentDate === '2026-10-15', 'Existing FormRecord keeps original Cycle Snapshot after config change');

// 測試 5: 新建立期別請款單套用生效的新規則（2026-11-10 -> 2026-11 期別，送件日 25、付款日 20）
const november = context.handleSaveForm({ ...basePayment, amount: 80, payloadJson: JSON.stringify({ applyDate: '2026-11-10' }) });
check(november.claimPeriodKey === '2026-11' && november.submissionDate === '2026-11-25' && november.expectedPaymentDate === '2026-12-20', 'New FormRecord for new period uses effective Cycle Config');

// 測試 6: 月請款總表以 claimPeriodKey 分組
const report = context.handleListMonthlyClaims({ claimPeriodKey: '2026-09', year: 2026 });
check(report.rows.length === 1 && report.rows[0].formId === payment.formId, 'Monthly report groups by claimPeriodKey');

// 測試 7: 歷史未指派期別的 Legacy 資料不會被臆測或胡亂指派
const yearSs = context.getYearDatabase(2026);
const formSheet = yearSs.getSheetByName(context.SHEETS.FORMS);
const legacy = { ...payment, formId: 'FRM-2026-LEGACY', billingPeriodId: '', claimPeriodKey: '', periodName: '', periodStart: '', periodEnd: '', submissionDate: '', expectedPaymentDate: '' };
formSheet.appendRow(context.objectToRow(context.SHEETS.FORMS, legacy));
const reportAfterLegacy = context.handleListMonthlyClaims({ claimPeriodKey: '2026-09', year: 2026 });
check(reportAfterLegacy.rows.length === 1, 'Legacy FormRecord without Snapshot remains unassigned and is not guessed');

// 測試 8: 年度請款總表整合性驗證（Annual Total === Sum of 1~12 Months）
const annualReport = context.handleGetAnnualBillingReport({ year: 2026 });
const sumOfMonths = annualReport.monthlySummaries.reduce((acc, m) => acc + (m.totalAmount || 0), 0);
check(Math.abs(annualReport.totalAmount - sumOfMonths) < 0.001, 'Annual report total strictly matches sum of 12 monthly totals');
check(annualReport.projectHierarchy && annualReport.projectHierarchy.length > 0, 'Annual report provides Project -> SubProject -> BudgetItem hierarchy');

console.log(`\nProject / Claim Cycle governance: ${passed}/${passed + failed} PASS`);
if (failed) process.exitCode = 1;
