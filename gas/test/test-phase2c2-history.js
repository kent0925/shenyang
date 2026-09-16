import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-mock.js';

// 直接引用 production 實際實作 pure functions
import {
  filterFormRecords,
  resolveCascadeFilter,
  sortFormRecords,
  paginateFormRecords,
  isFormArchived,
  DEFAULT_FILTER_STATE,
} from '../../src/utils/formRecordsFilter.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['Config.gs', 'Schema.gs', 'Utils.gs', 'IdService.gs', 'ApiService.gs', 'DatabaseService.gs', 'YearService.gs', 'Code.gs'];
const env = createGasEnvironment({ DRIVE_ROOT_FOLDER_ID: 'root', CURRENT_YEAR: '2026', SCHEMA_VERSION: '1' });
const context = vm.createContext({ ...env, Date, Buffer, console });

for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

// 初始化 master database
const ss = env.SpreadsheetApp.create('master');
env.PropertiesService.getScriptProperties().setProperty('MASTER_SPREADSHEET_ID', ss.getId());
context.getMasterDatabase();

let passed = 0;
let failed = 0;
const results = {};

const check = (key, ok, name) => {
  if (ok) {
    passed++;
    results[key] = 'PASS';
    console.log(`[PASS] ${key}. ${name}`);
  } else {
    failed++;
    results[key] = 'FAIL';
    console.error(`[FAIL] ${key}. ${name}`);
  }
};

const errorCode = (fn) => {
  try {
    fn();
    return '';
  } catch (e) {
    return e.code || e.message || 'ERROR';
  }
};

console.log('=== Phase 2C-2 Targeted Validation (A - P) ===\n');

// -------------------------------------------------------------
// 準備共用主檔與 Mock 資料
// -------------------------------------------------------------
const projectA = context.handleSaveProject({ company: '神揚建設', projectName: '專案甲' });
const subProjectA1 = context.handleSaveSubProject({ projectId: projectA.projectId, subProjectName: '甲區分案一' });
const subProjectA2 = context.handleSaveSubProject({ projectId: projectA.projectId, subProjectName: '甲區分案二' });

const projectB = context.handleSaveProject({ company: '茂揚實業', projectName: '專案乙' });
const subProjectB1 = context.handleSaveSubProject({ projectId: projectB.projectId, subProjectName: '乙區分案一' });

const vendor1 = context.handleSaveVendor({ vendorName: '甲級營造', taxId: '11112222' });
const vendor2 = context.handleSaveVendor({ vendorName: '乙級五金', taxId: '33334444' });

// 準備測試 FormRecord 陣列供 A-F 測試使用
const sampleForms = [
  {
    formId: 'FRM-2026-000101',
    formType: 'payment_request',
    company: '神揚建設',
    projectId: projectA.projectId,
    projectName: projectA.projectName,
    subProjectId: subProjectA1.subProjectId,
    subProjectName: subProjectA1.subProjectName,
    vendorId: vendor1.vendorId,
    vendorName: vendor1.vendorName,
    vendorTaxId: vendor1.taxId,
    amount: 150000,
    status: 'submitted',
    version: 2,
    excelFileId: 'drv_excel_101',
    pdfFileId: 'drv_pdf_101',
    updatedAt: '2026/09/16 10:00:00',
    createdAt: '2026/09/16 09:00:00',
    payloadJson: JSON.stringify({ secretCode: 'SECRET_PAYLOAD_A' }),
  },
  {
    formId: 'FRM-2026-000102',
    formType: 'payment_request',
    company: '神揚建設',
    projectId: projectA.projectId,
    projectName: projectA.projectName,
    subProjectId: subProjectA2.subProjectId,
    subProjectName: subProjectA2.subProjectName,
    vendorId: vendor2.vendorId,
    vendorName: vendor2.vendorName,
    vendorTaxId: vendor2.taxId,
    amount: 80000,
    status: 'submitted',
    version: 1,
    excelFileId: 'drv_excel_102',
    pdfFileId: '', // 尚未歸檔 PDF
    updatedAt: '2026/09/16 11:00:00',
    createdAt: '2026/09/16 10:30:00',
    payloadJson: JSON.stringify({ secretCode: 'SECRET_PAYLOAD_B' }),
  },
  {
    formId: 'FRM-2026-000103',
    formType: 'seal_approval',
    company: '茂揚實業',
    projectId: projectB.projectId,
    projectName: projectB.projectName,
    subProjectId: subProjectB1.subProjectId,
    subProjectName: subProjectB1.subProjectName,
    vendorId: vendor1.vendorId,
    vendorName: vendor1.vendorName,
    vendorTaxId: vendor1.taxId,
    amount: 0,
    status: 'submitted',
    version: 1,
    excelFileId: 'drv_excel_103',
    pdfFileId: 'drv_pdf_103',
    updatedAt: '2026/09/16 12:00:00',
    createdAt: '2026/09/16 11:30:00',
    payloadJson: JSON.stringify({ secretCode: 'SECRET_PAYLOAD_C' }),
  },
  {
    formId: 'FRM-2026-000104',
    formType: 'seal_approval',
    company: '茂揚實業',
    projectId: projectB.projectId,
    projectName: projectB.projectName,
    subProjectId: '',
    subProjectName: '',
    vendorId: '',
    vendorName: '',
    vendorTaxId: '',
    amount: 0,
    status: 'draft',
    version: 1,
    excelFileId: '',
    pdfFileId: '',
    updatedAt: '2026/09/16 08:00:00',
    createdAt: '2026/09/16 08:00:00',
    payloadJson: JSON.stringify({ secretCode: 'SECRET_PAYLOAD_D' }),
  },
];

// -------------------------------------------------------------
// A. record company/project/subproject/vendor filtering
// -------------------------------------------------------------
const filterByComp = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: '神揚建設',
});
const filterByProj = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  selectedProjectId: projectA.projectId,
});
const filterBySub = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  selectedSubProjectId: subProjectA1.subProjectId,
});
const filterByVend = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  selectedVendorId: vendor1.vendorId,
});

check(
  'A',
  filterByComp.length === 2 &&
  filterByProj.length === 2 &&
  filterBySub.length === 1 && filterBySub[0].formId === 'FRM-2026-000101' &&
  filterByVend.length === 2,
  'record company/project/subproject/vendor filtering'
);

// -------------------------------------------------------------
// B. filter cascade clearing
// -------------------------------------------------------------
// 初始狀態：選中了神揚建設、專案甲、分案甲1
const initialCascadeState = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: '神揚建設',
  selectedProjectId: projectA.projectId,
  selectedSubProjectId: subProjectA1.subProjectId,
  page: 3,
};
// 動作 1：切換公司為茂揚實業 -> 專案甲與分案甲1已不相容，必須自動清空，且 page 回到 1
const afterCompChange = resolveCascadeFilter(sampleForms, initialCascadeState, {
  selectedCompany: '茂揚實業',
});
// 動作 2：選中專案甲、分案甲1，若切換為專案乙 -> 分案甲1已不相容，必須清空
const stateWithProj = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: '神揚建設',
  selectedProjectId: projectA.projectId,
  selectedSubProjectId: subProjectA1.subProjectId,
};
const afterProjChange = resolveCascadeFilter(sampleForms, stateWithProj, {
  selectedProjectId: projectB.projectId,
});

check(
  'B',
  afterCompChange.selectedProjectId === '' &&
  afterCompChange.selectedSubProjectId === '' &&
  afterCompChange.page === 1 &&
  afterProjChange.selectedSubProjectId === '' &&
  afterProjChange.page === 1,
  'filter cascade clearing'
);

// -------------------------------------------------------------
// C. archive status filtering
// -------------------------------------------------------------
const archivedList = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  selectedArchiveStatus: 'archived',
});
const notArchivedList = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  selectedArchiveStatus: 'not_archived',
});

check(
  'C',
  archivedList.length === 2 &&
  archivedList.every((r) => r.excelFileId && r.pdfFileId) &&
  notArchivedList.length === 2 &&
  notArchivedList.every((r) => !r.excelFileId || !r.pdfFileId),
  'archive status filtering'
);

// -------------------------------------------------------------
// D. keyword includes subProjectName
// -------------------------------------------------------------
const matchedSubProject = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  searchQuery: '甲區分案二',
});
const notMatchedPayload = filterFormRecords(sampleForms, {
  ...DEFAULT_FILTER_STATE,
  searchQuery: 'SECRET_PAYLOAD_A', // 嚴禁搜尋 payloadJson
});

check(
  'D',
  matchedSubProject.length === 1 &&
  matchedSubProject[0].formId === 'FRM-2026-000102' &&
  notMatchedPayload.length === 0,
  'keyword includes subProjectName'
);

// -------------------------------------------------------------
// E. default updatedAt DESC sorting
// -------------------------------------------------------------
const sortedDefault = sortFormRecords(sampleForms, 'updatedAt_desc');
const sortedOldest = sortFormRecords(sampleForms, 'updatedAt_asc');
const sortedAmountDesc = sortFormRecords(sampleForms, 'amount_desc');

check(
  'E',
  sortedDefault[0].formId === 'FRM-2026-000103' && // 12:00:00 最新
  sortedOldest[0].formId === 'FRM-2026-000104' &&  // 08:00:00 最舊
  sortedAmountDesc[0].formId === 'FRM-2026-000101' && // 150,000 最高
  sortedAmountDesc[1].formId === 'FRM-2026-000102',   // 80,000 次高
  'default updatedAt DESC sorting'
);

// -------------------------------------------------------------
// F. pagination 20/50/100 behavior
// -------------------------------------------------------------
// 產生 55 筆模擬紀錄
const bulkRecords = Array.from({ length: 55 }, (_, i) => ({
  ...sampleForms[0],
  formId: `FRM-2026-${String(i + 1).padStart(6, '0')}`,
}));
const page20 = paginateFormRecords(bulkRecords, 1, 20);
const page20_last = paginateFormRecords(bulkRecords, 3, 20);
const page50 = paginateFormRecords(bulkRecords, 1, 50);
const page100 = paginateFormRecords(bulkRecords, 1, 100);

check(
  'F',
  page20.totalPages === 3 && page20.paginatedRecords.length === 20 &&
  page20_last.currentPage === 3 && page20_last.paginatedRecords.length === 15 &&
  page50.totalPages === 2 && page50.paginatedRecords.length === 50 &&
  page100.totalPages === 1 && page100.paginatedRecords.length === 55,
  'pagination 20/50/100 behavior'
);

// -------------------------------------------------------------
// G. listArchivedFormVersions returns vN → v1 order
// -------------------------------------------------------------
// 建立一個真實多版本的請款單並為其建立 v1, v2, v3 歸檔資料
const paymentForm = context.handleSaveForm({
  formType: 'payment_request',
  company: '神揚建設',
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subProjectA1.subProjectId,
  subProjectName: subProjectA1.subProjectName,
  amount: 60000,
});
const payId = paymentForm.formId;

// 第一次歸檔 (v1)
context.handleArchiveFormFiles({
  formId: payId,
  excel: { fileName: `${payId}_v1.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: Buffer.from('v1 excel').toString('base64') },
  pdf: { fileName: `${payId}_v1.pdf`, mimeType: 'application/pdf', base64: Buffer.from('v1 pdf').toString('base64') },
});

// 更新表單產生 v2 並歸檔
context.handleSaveForm({
  formId: payId,
  formType: 'payment_request',
  company: '神揚建設',
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subProjectA1.subProjectId,
  subProjectName: subProjectA1.subProjectName,
  amount: 70000,
});
context.handleArchiveFormFiles({
  formId: payId,
  excel: { fileName: `${payId}_v2.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: Buffer.from('v2 excel').toString('base64') },
  pdf: { fileName: `${payId}_v2.pdf`, mimeType: 'application/pdf', base64: Buffer.from('v2 pdf').toString('base64') },
});

// 更新表單產生 v3 並歸檔
context.handleSaveForm({
  formId: payId,
  formType: 'payment_request',
  company: '神揚建設',
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subProjectA1.subProjectId,
  subProjectName: subProjectA1.subProjectName,
  amount: 80000,
});
context.handleArchiveFormFiles({
  formId: payId,
  excel: { fileName: `${payId}_v3.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: Buffer.from('v3 excel').toString('base64') },
  pdf: { fileName: `${payId}_v3.pdf`, mimeType: 'application/pdf', base64: Buffer.from('v3 pdf').toString('base64') },
});

const versionsPay = context.handleListArchivedFormVersions({ formId: payId });

check(
  'G',
  versionsPay.length === 3 &&
  versionsPay[0].version === 3 &&
  versionsPay[1].version === 2 &&
  versionsPay[2].version === 1,
  'listArchivedFormVersions returns vN → v1 order'
);

// -------------------------------------------------------------
// H. current version marked correctly
// -------------------------------------------------------------
check(
  'H',
  versionsPay[0].version === 3 && versionsPay[0].isCurrent === true &&
  versionsPay[1].version === 2 && versionsPay[1].isCurrent === false &&
  versionsPay[2].version === 1 && versionsPay[2].isCurrent === false,
  'current version marked correctly'
);

// -------------------------------------------------------------
// I. old Payment XLSX + PDF retrieval
// -------------------------------------------------------------
const oldPayExcel = context.handleGetArchivedFormFile({
  formId: payId,
  fileType: 'excel',
  version: 1,
});
const oldPayPdf = context.handleGetArchivedFormFile({
  formId: payId,
  fileType: 'pdf',
  version: 1,
});

check(
  'I',
  oldPayExcel.fileName === `${payId}_v1.xlsx` &&
  oldPayExcel.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
  Buffer.from(oldPayExcel.base64, 'base64').toString() === 'v1 excel' &&
  oldPayPdf.fileName === `${payId}_v1.pdf` &&
  oldPayPdf.mimeType === 'application/pdf' &&
  Buffer.from(oldPayPdf.base64, 'base64').toString() === 'v1 pdf',
  'old Payment XLSX + PDF retrieval'
);

// -------------------------------------------------------------
// J. old Seal XLSM + PDF retrieval
// -------------------------------------------------------------
const sealForm = context.handleSaveForm({
  formType: 'seal_approval',
  company: '神揚建設',
  projectName: '用印專案',
});
const sealId = sealForm.formId;

// v1 歸檔
context.handleArchiveFormFiles({
  formId: sealId,
  excel: { fileName: `${sealId}_v1.xlsm`, mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', base64: Buffer.from('v1 xlsm').toString('base64') },
  pdf: { fileName: `${sealId}_v1.pdf`, mimeType: 'application/pdf', base64: Buffer.from('v1 seal pdf').toString('base64') },
});

// v2 儲存與歸檔
context.handleSaveForm({
  formId: sealId,
  formType: 'seal_approval',
  company: '神揚建設',
  projectName: '用印專案修正',
});
context.handleArchiveFormFiles({
  formId: sealId,
  excel: { fileName: `${sealId}_v2.xlsm`, mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', base64: Buffer.from('v2 xlsm').toString('base64') },
  pdf: { fileName: `${sealId}_v2.pdf`, mimeType: 'application/pdf', base64: Buffer.from('v2 seal pdf').toString('base64') },
});

const oldSealXlsm = context.handleGetArchivedFormFile({
  formId: sealId,
  fileType: 'excel',
  version: 1,
});
const oldSealPdf = context.handleGetArchivedFormFile({
  formId: sealId,
  fileType: 'pdf',
  version: 1,
});

check(
  'J',
  oldSealXlsm.fileName === `${sealId}_v1.xlsm` &&
  oldSealXlsm.mimeType === 'application/vnd.ms-excel.sheet.macroEnabled.12' &&
  Buffer.from(oldSealXlsm.base64, 'base64').toString() === 'v1 xlsm' &&
  oldSealPdf.fileName === `${sealId}_v1.pdf` &&
  oldSealPdf.mimeType === 'application/pdf' &&
  Buffer.from(oldSealPdf.base64, 'base64').toString() === 'v1 seal pdf',
  'old Seal XLSM + PDF retrieval'
);

// -------------------------------------------------------------
// K. old-version PDF print data retrieval path
// -------------------------------------------------------------
const printDataPay = context.handleGetArchivedFormFile({
  formId: payId,
  fileType: 'pdf',
  version: 2,
});

check(
  'K',
  printDataPay.fileName === `${payId}_v2.pdf` &&
  printDataPay.mimeType === 'application/pdf' &&
  Boolean(printDataPay.base64),
  'old-version PDF print data retrieval path'
);

// -------------------------------------------------------------
// L. version query does NOT create Drive folders
// -------------------------------------------------------------
const unarchivedForm = context.handleSaveForm({
  formType: 'payment_request',
  company: '神揚建設',
  projectId: projectA.projectId,
  projectName: projectA.projectName,
  subProjectId: subProjectA1.subProjectId,
  subProjectName: subProjectA1.subProjectName,
  amount: 20000,
});
const unarchivedId = unarchivedForm.formId;

const initialFolderCount = env.driveContext ? env.driveContext.folders.size : 0;
context.handleListArchivedFormVersions({ formId: unarchivedId });
const afterFolderCount = env.driveContext ? env.driveContext.folders.size : 0;

check(
  'L',
  initialFolderCount === afterFolderCount,
  'version query does NOT create Drive folders'
);

// -------------------------------------------------------------
// M. missing archive folder returns []
// -------------------------------------------------------------
const unarchivedVersions = context.handleListArchivedFormVersions({ formId: unarchivedId });

check(
  'M',
  Array.isArray(unarchivedVersions) && unarchivedVersions.length === 0,
  'missing archive folder returns []'
);

// -------------------------------------------------------------
// N. arbitrary Drive fileId cannot be requested
// -------------------------------------------------------------
// 測試非法版本（如負數或小數或字串）拋出 VALIDATION_ERROR
const invalidVerCode1 = errorCode(() => {
  context.handleGetArchivedFormFile({ formId: payId, fileType: 'excel', version: -1 });
});
const invalidVerCode2 = errorCode(() => {
  context.handleGetArchivedFormFile({ formId: payId, fileType: 'excel', version: 1.5 });
});
const notFoundVerCode = errorCode(() => {
  context.handleGetArchivedFormFile({ formId: payId, fileType: 'excel', version: 999 });
});

check(
  'N',
  invalidVerCode1 === 'VALIDATION_ERROR' &&
  invalidVerCode2 === 'VALIDATION_ERROR' &&
  notFoundVerCode === 'NOT_FOUND',
  'arbitrary Drive fileId cannot be requested'
);

// -------------------------------------------------------------
// O. getArchivedFormFile without version remains backward compatible
// -------------------------------------------------------------
const currentPayExcel = context.handleGetArchivedFormFile({
  formId: payId,
  fileType: 'excel',
});
const currentPayPdf = context.handleGetArchivedFormFile({
  formId: payId,
  fileType: 'pdf',
});

check(
  'O',
  currentPayExcel.fileName === `${payId}_v3.xlsx` &&
  currentPayPdf.fileName === `${payId}_v3.pdf`,
  'getArchivedFormFile without version remains backward compatible'
);

// -------------------------------------------------------------
// P. legacy FormRecord with no archive still displays safely
// -------------------------------------------------------------
const legacyRecord = {
  formId: 'FRM-2026-LEGACY',
  formType: 'payment_request',
  company: '舊公司',
  excelFileId: '',
  pdfFileId: '',
  version: 1,
};

const isArchived = isFormArchived(legacyRecord);
const legacyVersions = context.handleListArchivedFormVersions({ formId: unarchivedId });

check(
  'P',
  isArchived === false &&
  Array.isArray(legacyVersions) && legacyVersions.length === 0,
  'legacy FormRecord with no archive still displays safely'
);

console.log(`\n========================================`);
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
