import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createGasEnvironment } from './gas-mock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['Config.gs', 'Schema.gs', 'Utils.gs', 'IdService.gs', 'ApiService.gs', 'DatabaseService.gs', 'YearService.gs', 'Code.gs'];
const env = createGasEnvironment({ DRIVE_ROOT_FOLDER_ID: 'root', CURRENT_YEAR: '2026', SCHEMA_VERSION: '1' });
const context = vm.createContext({ ...env, Date, Buffer, console });

for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

// 初始化 master spreadsheet
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

// 準備主檔測試資料（專案、分案、廠商）
const project = context.handleSaveProject({
  company: '神揚建設股份有限公司',
  projectName: 'Phase 2C 歸檔專案',
});
const subProject = context.handleSaveSubProject({
  projectId: project.projectId,
  subProjectName: '一期工程',
});
const vendor = context.handleSaveVendor({
  vendorName: '測試營造股份有限公司',
  taxId: '12345678',
});

// A. Payment XLSX + PDF archive
const samplePaymentForm = context.handleSaveForm({
  formType: 'payment_request',
  company: project.company,
  year: 2026,
  projectId: project.projectId,
  projectName: project.projectName,
  subProjectId: subProject.subProjectId,
  subProjectName: subProject.subProjectName,
  vendorId: vendor.vendorId,
  vendorName: vendor.vendorName,
  budgetType: 'unbudgeted',
  amount: 50000,
  status: 'draft',
  payloadJson: '{"note":"test payment"}',
});

const paymentXlsxBase64 = Buffer.from('FAKE-PAYMENT-XLSX-BINARY').toString('base64');
const paymentPdfBase64 = Buffer.from('FAKE-PAYMENT-PDF-BINARY').toString('base64');

const paymentArchiveRes = context.handleArchiveFormFiles({
  formId: samplePaymentForm.formId,
  excel: {
    fileName: '請款單_2026.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: paymentXlsxBase64,
  },
  pdf: {
    fileName: '請款單_2026.pdf',
    mimeType: 'application/pdf',
    base64: paymentPdfBase64,
  },
});

check('A', Boolean(paymentArchiveRes.excelFileId && paymentArchiveRes.pdfFileId), 'Payment XLSX + PDF archive');

// B. Seal XLSM + PDF archive
const sampleSealForm = context.handleSaveForm({
  formType: 'seal_approval',
  company: project.company,
  year: 2026,
  status: 'draft',
  payloadJson: '{"subject":"測試用印申請"}',
});

const sealXlsmBase64 = Buffer.from('FAKE-SEAL-XLSM-BINARY').toString('base64');
const sealPdfBase64 = Buffer.from('FAKE-SEAL-PDF-BINARY').toString('base64');

const sealArchiveRes = context.handleArchiveFormFiles({
  formId: sampleSealForm.formId,
  excel: {
    fileName: '用印及簽核表單.xlsm',
    mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    base64: sealXlsmBase64,
  },
  pdf: {
    fileName: '用印及簽核表單.pdf',
    mimeType: 'application/pdf',
    base64: sealPdfBase64,
  },
});

check('B', Boolean(sealArchiveRes.excelFileId && sealArchiveRes.pdfFileId), 'Seal XLSM + PDF archive');

// C. Both file IDs written to FormRecord
const updatedPaymentForm = context.handleGetForm({ formId: samplePaymentForm.formId });
const updatedSealForm = context.handleGetForm({ formId: sampleSealForm.formId });

check(
  'C',
  Boolean(
    updatedPaymentForm.excelFileId === paymentArchiveRes.excelFileId &&
    updatedPaymentForm.pdfFileId === paymentArchiveRes.pdfFileId &&
    updatedSealForm.excelFileId === sealArchiveRes.excelFileId &&
    updatedSealForm.pdfFileId === sealArchiveRes.pdfFileId
  ),
  'Both file IDs written to FormRecord'
);

// D. archiveFormFiles does NOT increment Form version
check(
  'D',
  Number(updatedPaymentForm.version) === Number(samplePaymentForm.version) &&
  Number(updatedSealForm.version) === Number(sampleSealForm.version),
  'archiveFormFiles does NOT increment Form version'
);

// E. nonexistent formId rejected
const rejectNonexistent = errorCode(() => {
  context.handleArchiveFormFiles({
    formId: 'FRM-2026-999999',
    excel: {
      fileName: 'test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: paymentXlsxBase64,
    },
    pdf: {
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      base64: paymentPdfBase64,
    },
  });
});
check('E', rejectNonexistent === 'NOT_FOUND', 'nonexistent formId rejected');

// F. partial archive rollback
// 建立一張測試表單，在建立 PDF 時故意讓 Utilities.newBlob 或 base64 解碼出錯
const rollbackForm = context.handleSaveForm({
  formType: 'seal_approval',
  company: project.company,
  year: 2026,
  status: 'draft',
  payloadJson: '{"subject":"rollback test"}',
});

// 紀錄目前的檔案總數
const filesBefore = Array.from(env._internal.files.values()).length;

const rollbackErr = errorCode(() => {
  context.handleArchiveFormFiles({
    formId: rollbackForm.formId,
    excel: {
      fileName: 'test.xlsm',
      mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      base64: sealXlsmBase64,
    },
    pdf: {
      fileName: 'bad.pdf',
      mimeType: 'image/png', // 故意傳入錯誤 MIME，觸發驗證失敗
      base64: 'bad',
    },
  });
});

// 另外測試如果在建立檔案過程中失敗（例如 PDF base64Decode 出錯）
let createdExcelFile = null;
const originalBase64Decode = context.Utilities.base64Decode;
let decodeCallCount = 0;
context.Utilities.base64Decode = function (str) {
  decodeCallCount++;
  if (decodeCallCount === 2) {
    throw new Error('PDF decode simulated crash');
  }
  return originalBase64Decode(str);
};

const crashErr = errorCode(() => {
  context.handleArchiveFormFiles({
    formId: rollbackForm.formId,
    excel: {
      fileName: 'test_rollback.xlsm',
      mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      base64: sealXlsmBase64,
    },
    pdf: {
      fileName: 'test_rollback.pdf',
      mimeType: 'application/pdf',
      base64: sealPdfBase64,
    },
  });
});

context.Utilities.base64Decode = originalBase64Decode;

const rollbackFormAfter = context.handleGetForm({ formId: rollbackForm.formId });
// 檢查新建立的 Excel 是否已被 trashed，且 rollbackForm 的 file IDs 未被更動
const newlyCreatedExcel = Array.from(env._internal.files.values()).find(f => f.getName() === 'test_rollback.xlsm');
const isExcelTrashed = newlyCreatedExcel ? newlyCreatedExcel.isTrashed() : true;

check(
  'F',
  isExcelTrashed && !rollbackFormAfter.excelFileId && !rollbackFormAfter.pdfFileId,
  'partial archive rollback'
);

// G. same-version regeneration does not create uncontrolled duplicates
// 對已歸檔的 samplePaymentForm (v1) 再次進行歸檔
const rootFolderId = env.PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_FOLDER_ID');
const rootFolder = env.DriveApp.getFolderById(rootFolderId);
const archiveRoot = rootFolder.getFoldersByName('表單歸檔').next();
const yearFolder = archiveRoot.getFoldersByName('2026').next();
const paymentTypeFolder = yearFolder.getFoldersByName('請款單').next();
const formFolder = paymentTypeFolder.getFoldersByName(samplePaymentForm.formId).next();
const v1Folder = formFolder.getFoldersByName('v1').next();

// 執行同版本第二次歸檔
context.handleArchiveFormFiles({
  formId: samplePaymentForm.formId,
  excel: {
    fileName: '請款單_2026_re.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: paymentXlsxBase64,
  },
  pdf: {
    fileName: '請款單_2026_re.pdf',
    mimeType: 'application/pdf',
    base64: paymentPdfBase64,
  },
});

const v1FilesAfter = [];
const itV1 = v1Folder.getFiles();
while (itV1.hasNext()) {
  v1FilesAfter.push(itV1.next());
}

check('G', v1FilesAfter.length === 2, 'same-version regeneration does not create uncontrolled duplicates');

// H. old version files remain preserved
// 更新 samplePaymentForm 使其版本升為 v2
const v2Form = context.handleSaveForm({
  formId: samplePaymentForm.formId,
  formType: 'payment_request',
  company: project.company,
  year: 2026,
  projectId: project.projectId,
  projectName: project.projectName,
  subProjectId: subProject.subProjectId,
  subProjectName: subProject.subProjectName,
  vendorId: vendor.vendorId,
  vendorName: vendor.vendorName,
  budgetType: 'unbudgeted',
  amount: 60000,
  status: 'draft',
});

// 對 v2 進行歸檔
context.handleArchiveFormFiles({
  formId: v2Form.formId,
  excel: {
    fileName: '請款單_v2.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: paymentXlsxBase64,
  },
  pdf: {
    fileName: '請款單_v2.pdf',
    mimeType: 'application/pdf',
    base64: paymentPdfBase64,
  },
});

// 檢查 v1 資料夾檔案是否仍完好保留
const v1FilesCheck = [];
const itV1Check = v1Folder.getFiles();
while (itV1Check.hasNext()) {
  v1FilesCheck.push(itV1Check.next());
}

const v2Folder = formFolder.getFoldersByName('v2').next();
const v2FilesCheck = [];
const itV2Check = v2Folder.getFiles();
while (itV2Check.hasNext()) {
  v2FilesCheck.push(itV2Check.next());
}

check(
  'H',
  v1FilesCheck.length === 2 && v2FilesCheck.length === 2 && !v1FilesCheck[0].isTrashed(),
  'old version files remain preserved'
);

// I. old FormRecord without file IDs remains compatible
const legacyFormRow = context.objectToRow(context.SHEETS.FORMS, {
  formId: 'FRM-2026-LEGACY',
  formType: 'payment_request',
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: '',
  company: project.company,
  projectId: project.projectId,
  projectName: project.projectName,
  subProjectId: subProject.subProjectId,
  subProjectName: subProject.subProjectName,
  vendorId: vendor.vendorId,
  vendorName: vendor.vendorName,
  vendorTaxId: '',
  budgetType: 'unbudgeted',
  budgetItemId: '',
  amount: 100,
  payloadJson: '{}',
  excelFileId: '',
  pdfFileId: '',
  version: 1,
});
const formsSheet = context.getYearDatabase(2026).getSheetByName(context.SHEETS.FORMS);
formsSheet.appendRow(legacyFormRow);

const readLegacy = context.handleGetForm({ formId: 'FRM-2026-LEGACY' });
const legacyDownloadErr = errorCode(() => {
  context.handleGetArchivedFormFile({ formId: 'FRM-2026-LEGACY', fileType: 'excel' });
});

check(
  'I',
  readLegacy.formId === 'FRM-2026-LEGACY' && legacyDownloadErr === 'NOT_FOUND',
  'old FormRecord without file IDs remains compatible'
);

// J. archived Excel/PDF can be downloaded again by Form Records
const retrievedExcel = context.handleGetArchivedFormFile({
  formId: v2Form.formId,
  fileType: 'excel',
});
const retrievedPdf = context.handleGetArchivedFormFile({
  formId: v2Form.formId,
  fileType: 'pdf',
});

check(
  'J',
  retrievedExcel.fileName === '請款單_v2.xlsx' &&
  retrievedPdf.fileName === '請款單_v2.pdf' &&
  Boolean(retrievedExcel.base64 && retrievedPdf.base64),
  'archived Excel/PDF can be downloaded again by Form Records'
);

console.log(`\n=== 驗證總結: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
