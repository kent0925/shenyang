/**
 * scripts/test-phase2b-forms.ts - Phase 2B-2C 表單持久化適配器完整單元驗證 (Case F1 ~ F7)
 */

import {
  serializeSealApproval,
  deserializeSealApproval,
  serializePaymentRequest,
  deserializePaymentRequest,
} from '../src/services/formAdapters';
import type { FormRecord } from '../src/models/backend';
import type { SealApprovalData } from '../src/models/sealApproval';
import type { PaymentRequestData } from '../src/models/paymentRequest';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: ${detail || '條件不符合'}`);
    failed++;
  }
}

// ==========================================
// Case F1: SealApprovalData round-trip
// ==========================================
const testSealData: SealApprovalData = {
  company: '昇陽開發實業股份有限公司',
  applyDate: '2026-09-15',
  types: ['用印', '簽呈'],
  subject: '測試土方工程合約用印案',
  description: '1. 依工務部簽呈辦理。\n2. 請惠予用印。',
};

const sealPayload = serializeSealApproval(testSealData);
const mockSealRecord: FormRecord = {
  formId: 'FRM-2026-000001',
  formType: sealPayload.formType,
  status: sealPayload.status || 'submitted',
  company: sealPayload.company,
  projectId: '',
  projectName: '',
  vendorId: '',
  vendorName: '',
  vendorTaxId: '',
  budgetType: 'budgeted',
  budgetItemId: '',
  amount: 0,
  payloadJson: sealPayload.payloadJson as string,
  excelFileId: '',
  pdfFileId: '',
  version: 1,
  createdAt: '2026-09-15 10:00:00',
  updatedAt: '2026-09-15 10:00:00',
  createdBy: '',
};

const hydratedSeal = deserializeSealApproval(mockSealRecord);
assert(
  hydratedSeal.company === testSealData.company &&
  hydratedSeal.applyDate === testSealData.applyDate &&
  hydratedSeal.subject === testSealData.subject &&
  hydratedSeal.description === testSealData.description &&
  hydratedSeal.types.length === 2 &&
  hydratedSeal.types[0] === '用印' &&
  hydratedSeal.types[1] === '簽呈',
  'Case F1: SealApprovalData -> serialize -> payloadJson -> deserialize 核心欄位保持一致'
);

// ==========================================
// Case F2: PaymentRequestData round-trip
// ==========================================
const testPaymentData: PaymentRequestData = {
  company: '東勛工程有限公司',
  applyDate: '2026-09-15',
  project: 'P001 昇陽大樓新建工程',
  requisitionNumber: 'REQ-2026-088',
  vendor: '紫雲營造股份有限公司',
  vendorTaxId: '84123456',
  department: '工務部',
  contractNumber: 'CNT-2026-001',
  bankAccount: {
    type: 'code',
    bankCode: '007',
    bankName: '第一商業銀行',
    branch: '城東分行',
    accountName: '紫雲營造股份有限公司',
    accountNumber: '14410123456',
  },
  bankCode: '007',
  bankName: '第一商業銀行',
  branchCode: '1440',
  branchName: '城東分行',
  accountName: '紫雲營造股份有限公司',
  accountNumber: '14410123456',
  accountNameSameAsVendor: true,
  expenseNature: '土方工程第一期工程款',
  contractTotal: '5,000,000',
  dueDate: '2026-09-30',
  currentAmount: '1,500,000',
  retentionAmount: '150,000',
  advanceDeduction: '0',
  penaltyDiscount: '0',
  specialRequirements: {
    noCross: false,
    noEndorse: false,
    cashiersCheck: false,
    postDatedCheck: false,
    postDatedDate: '',
    wireTransfer: true,
    offsetBorrowing: false,
  },
  description: '請撥付第一期土方開挖款項。',
};

const paymentPayload = serializePaymentRequest(testPaymentData);
const mockPaymentRecord: FormRecord = {
  formId: 'FRM-2026-000002',
  formType: paymentPayload.formType,
  status: paymentPayload.status || 'submitted',
  company: paymentPayload.company,
  projectId: '',
  projectName: paymentPayload.projectName || '',
  vendorId: '',
  vendorName: paymentPayload.vendorName || '',
  vendorTaxId: paymentPayload.vendorTaxId || '',
  budgetType: 'budgeted',
  budgetItemId: '',
  amount: paymentPayload.amount || 0,
  payloadJson: paymentPayload.payloadJson as string,
  excelFileId: '',
  pdfFileId: '',
  version: 1,
  createdAt: '2026-09-15 10:00:00',
  updatedAt: '2026-09-15 10:00:00',
  createdBy: '',
};

const hydratedPayment = deserializePaymentRequest(mockPaymentRecord);
assert(
  hydratedPayment.company === testPaymentData.company &&
  hydratedPayment.project === testPaymentData.project &&
  hydratedPayment.vendor === testPaymentData.vendor &&
  hydratedPayment.vendorTaxId === testPaymentData.vendorTaxId &&
  hydratedPayment.currentAmount === testPaymentData.currentAmount &&
  hydratedPayment.bankAccount.accountNumber === '14410123456' &&
  mockPaymentRecord.amount === 1500000,
  'Case F2: PaymentRequestData -> serialize -> payloadJson -> deserialize 核心欄位保持一致且金額數值正確'
);

// ==========================================
// Case F3: Invalid payloadJson 安全失敗，不 crash
// ==========================================
let caseF3Caught = false;
try {
  const badRecord: FormRecord = {
    ...mockSealRecord,
    payloadJson: 'INVALID_CORRUPTED_JSON{{{{{',
  };
  deserializeSealApproval(badRecord);
} catch (e: any) {
  caseF3Caught = true;
}
assert(caseF3Caught, 'Case F3: 損毀之 payloadJson 能被安全捕獲並丟出安全錯誤，不造成系統崩潰');

// ==========================================
// Case F4: seal_approval record 不得 deserialize 成 payment request
// ==========================================
let caseF4Caught = false;
try {
  deserializePaymentRequest(mockSealRecord);
} catch (e: any) {
  caseF4Caught = e.message.includes('表單類型不符');
}
assert(caseF4Caught, 'Case F4: seal_approval 紀錄嚴格拒絕 deserialize 成 payment_request');

// ==========================================
// Case F5: payment_request record 不得 deserialize 成 seal approval
// ==========================================
let caseF5Caught = false;
try {
  deserializeSealApproval(mockPaymentRecord);
} catch (e: any) {
  caseF5Caught = e.message.includes('表單類型不符');
}
assert(caseF5Caught, 'Case F5: payment_request 紀錄嚴格拒絕 deserialize 成 seal_approval');

// ==========================================
// Case F6: new form (無 formId) -> save payload 不捏造 formId
// ==========================================
const newSealPayload = serializeSealApproval(testSealData, undefined);
const newPaymentPayload = serializePaymentRequest(testPaymentData, undefined);
assert(
  newSealPayload.formId === undefined && newPaymentPayload.formId === undefined,
  'Case F6: 新表單未傳遞 formId 時，SaveFormPayload.formId 必須為 undefined (由後端自動產生)'
);

// ==========================================
// Case F7: existing record (formId = F123) -> update payload 保留 F123
// ==========================================
const existingSealPayload = serializeSealApproval(testSealData, 'FRM-2026-000088');
const existingPaymentPayload = serializePaymentRequest(testPaymentData, 'FRM-2026-000099');
assert(
  existingSealPayload.formId === 'FRM-2026-000088' &&
  existingPaymentPayload.formId === 'FRM-2026-000099',
  'Case F7: 既有表單傳入 formId 時，SaveFormPayload 必須完整保留原 formId 以進行更新'
);

// ==========================================
// 總結
// ==========================================
console.log(`\n測試總結：${passed} 通過，${failed} 失敗`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('所有 Adapter 測試通過！');
}
