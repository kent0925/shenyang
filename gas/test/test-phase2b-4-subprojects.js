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
const ss = env.SpreadsheetApp.create('master');
env.PropertiesService.getScriptProperties().setProperty('MASTER_SPREADSHEET_ID', ss.getId());
context.getMasterDatabase();

let passed = 0; let failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.error(`[FAIL] ${name}`); } };
const errorCode = (fn) => { try { fn(); return ''; } catch (e) { return e.code || ''; } };

const project = context.handleSaveProject({ company: '[E2E-2B-FINAL] 公司', projectName: '[E2E-2B-FINAL] 主專案' });
const other = context.handleSaveProject({ company: '[E2E-2B-FINAL] 公司', projectName: '[E2E-2B-FINAL] 另一專案' });
const sub = context.handleSaveSubProject({ projectId: project.projectId, subProjectName: '[E2E-2B-FINAL] 分案 A' });
const otherSub = context.handleSaveSubProject({ projectId: other.projectId, subProjectName: '[E2E-2B-FINAL] 另一分案' });
check(/^SUB-\d{6}$/.test(sub.subProjectId), 'SubProject create / SUB ID');
check(context.handleListSubProjects({ projectId: project.projectId }).length === 1, 'listSubProjects project filter');
const updatedSub = context.handleSaveSubProject({ subProjectId: sub.subProjectId, projectId: project.projectId, subProjectName: '[E2E-2B-FINAL] 分案 A updated', status: 'inactive' });
check(updatedSub.subProjectName.endsWith('updated') && updatedSub.createdAt === sub.createdAt, 'SubProject update preserves createdAt');
check(errorCode(() => context.handleSaveSubProject({ projectId: other.projectId, subProjectId: sub.subProjectId, subProjectName: 'bad' })) === 'VALIDATION_ERROR', 'SubProject project mismatch rejection');

const budget = context.handleSaveBudgetItem({ year: 2026, projectId: project.projectId, company: project.company, projectName: project.projectName, subProjectId: sub.subProjectId, subProjectName: 'spoof', itemName: '[E2E-2B-FINAL] 預算項目', budgetAmount: 1000 });
check(budget.subProjectName === updatedSub.subProjectName, 'BudgetItem authoritative SubProject name');
check(errorCode(() => context.handleSaveBudgetItem({ year: 2026, projectId: other.projectId, company: other.company, projectName: other.projectName, subProjectId: sub.subProjectId, itemName: 'bad' })) === 'VALIDATION_ERROR', 'BudgetItem project/SubProject mismatch rejection');
check(errorCode(() => context.handleSaveBudgetItem({ year: 2026, projectId: project.projectId, company: project.company, projectName: project.projectName, itemName: 'missing sub' })) === 'VALIDATION_ERROR', 'New BudgetItem requires SubProject');

const baseForm = { formType: 'payment_request', company: project.company, year: 2026, projectId: project.projectId, projectName: project.projectName, subProjectId: sub.subProjectId, subProjectName: updatedSub.subProjectName, budgetType: 'unbudgeted', amount: 1, status: 'draft', payloadJson: '{}' };
check(!!context.handleSaveForm(baseForm).formId, 'Form accepts unbudgeted with SubProject');
check(errorCode(() => context.handleSaveForm({ ...baseForm, subProjectId: otherSub.subProjectId })) === 'VALIDATION_ERROR', 'Form project/SubProject mismatch rejection');
check(errorCode(() => context.handleSaveForm({ ...baseForm, subProjectId: '' })) === 'VALIDATION_ERROR', 'New unbudgeted Form requires SubProject');

const legacyRow = ['BUD-LEGACY', '2026', project.projectId, 'legacy company', project.projectName, 'legacy item', '', '', 10, 0, 'active', new Date(), new Date()];
const legacySheet = context.getYearDatabase(2026).getSheetByName(context.SHEETS.BUDGET_ITEMS);
legacySheet.appendRow(legacyRow);
const legacy = context.rowToObject(context.SHEETS.BUDGET_ITEMS, legacyRow);
check(legacy.subProjectId === '' && legacy.itemName === 'legacy item', 'Legacy BudgetItem missing SubProject safe read');
const oldCount = context.SCHEMAS[context.SHEETS.BUDGET_ITEMS].columns.length;
context.setupSheetStructure(legacySheet, context.SCHEMAS[context.SHEETS.BUDGET_ITEMS]);
check(legacySheet.getRange(legacySheet.getLastRow(), 1, 1, oldCount).getValues()[0][0] === 'BUD-LEGACY', 'Schema extension preserves existing row values');
check(context.openMasterDatabaseFast && context.handleListSubProjects, 'SubProject CRUD uses fast master accessor');

// Review fix: English-key legacy header must be canonicalized before extension.
const englishLegacy = context.getYearDatabase(2026).insertSheet('英文舊版預算測試');
const oldKeys = ['budgetItemId', 'year', 'projectId', 'company', 'projectName', 'itemName', 'vendorId', 'vendorName', 'budgetAmount', 'terminatedAmount', 'status', 'createdAt', 'updatedAt'];
const oldValues = ['BUD-ENGLISH', '2026', 'PRJ-ENGLISH', 'legacy company', 'legacy project', 'legacy item', 'VEN-007', 'legacy vendor', 12345, 678, 'active', new Date('2026-01-01'), new Date('2026-01-02')];
englishLegacy.getRange(1, 1, 1, oldKeys.length).setValues([oldKeys]);
englishLegacy.getRange(2, 1, 1, oldValues.length).setValues([oldValues]);
context.setupSheetStructure(englishLegacy, context.SCHEMAS[context.SHEETS.BUDGET_ITEMS]);
const migrated = context.rowToObject(context.SHEETS.BUDGET_ITEMS, englishLegacy.getRange(2, 1, 1, oldCount).getValues()[0]);
check(migrated.budgetItemId === 'BUD-ENGLISH', 'English migration keeps budgetItemId');
check(migrated.projectId === 'PRJ-ENGLISH' && migrated.projectName === 'legacy project', 'English migration keeps project relation');
check(migrated.subProjectId === '' && migrated.subProjectName === '', 'English migration leaves legacy SubProject blank');
check(migrated.itemName === 'legacy item', 'English migration keeps itemName');
check(migrated.vendorId === 'VEN-007' && migrated.vendorName === 'legacy vendor', 'English migration keeps vendor relation');
check(Number(migrated.budgetAmount) === 12345 && Number(migrated.terminatedAmount) === 678, 'English migration keeps amounts');
check(migrated.status === 'active', 'English migration keeps status');

console.log(`\nPhase 2B-4 GAS tests: ${passed}/${passed + failed} PASS`);
if (failed) process.exitCode = 1;
