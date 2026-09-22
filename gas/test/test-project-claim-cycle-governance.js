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
const basePayment = { formType: 'payment_request', company: project.company, year: 2026, projectId: project.projectId, projectName: project.projectName, subProjectId: sub.subProjectId, subProjectName: sub.subProjectName, vendorId: '', vendorName: '廠商', budgetType: 'budgeted', budgetItemId: reopenedBudget.budgetItemId, amount: 100, status: 'submitted', payloadJson: JSON.stringify({ applyDate: '2026-09-21' }) };
check(codeOf(() => context.handleSaveForm({ ...basePayment, subProjectId: otherSub.subProjectId })) === 'VALIDATION_ERROR', 'Budgeted Payment rejects BudgetItem from another SubProject');
const payment = context.handleSaveForm(basePayment);
check(payment.claimPeriodKey === '2026-09' && payment.periodStart === '2026-09-01' && payment.periodEnd === '2026-09-30' && payment.submissionDate === '2026-09-20' && payment.expectedPaymentDate === '2026-10-15', 'Default month Claim Cycle Snapshot is correct');

context.handleSaveBillingCycleRule({ effectiveFrom: '2026-10-01', submissionDay: 25, paymentMonthOffset: 1, paymentDay: 20 });
const edited = context.handleSaveForm({ ...basePayment, formId: payment.formId, expectedVersion: payment.version, amount: 120, payloadJson: JSON.stringify({ applyDate: '2026-09-21' }) });
check(edited.claimPeriodKey === '2026-09' && edited.submissionDate === '2026-09-20' && edited.expectedPaymentDate === '2026-10-15', 'Existing FormRecord keeps original Cycle Snapshot after config change');
const october = context.handleSaveForm({ ...basePayment, amount: 80, payloadJson: JSON.stringify({ applyDate: '2026-10-10' }) });
check(october.claimPeriodKey === '2026-10' && october.submissionDate === '2026-10-25' && october.expectedPaymentDate === '2026-11-20', 'New FormRecord uses effective Cycle Config');
const report = context.handleListMonthlyClaims({ claimPeriodKey: '2026-09', year: 2026 });
check(report.rows.length === 1 && report.rows[0].formId === payment.formId, 'Monthly report groups by claimPeriodKey instead of createdAt');

const yearSs = context.getYearDatabase(2026);
const formSheet = yearSs.getSheetByName(context.SHEETS.FORMS);
const legacy = { ...payment, formId: 'FRM-2026-LEGACY', billingPeriodId: '', claimPeriodKey: '', periodName: '', periodStart: '', periodEnd: '', submissionDate: '', expectedPaymentDate: '' };
formSheet.appendRow(context.objectToRow(context.SHEETS.FORMS, legacy));
const reportAfterLegacy = context.handleListMonthlyClaims({ claimPeriodKey: '2026-09', year: 2026 });
check(reportAfterLegacy.rows.length === 1, 'Legacy FormRecord without Snapshot remains unassigned and is not guessed');

console.log(`\nProject / Claim Cycle governance: ${passed}/${passed + failed} PASS`);
if (failed) process.exitCode = 1;
