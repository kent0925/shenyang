/**
 * scripts/test-phase2b-3cd-adapters.ts - Phase 2B-3C/D 預算適配器與預算純計算模組 Targeted Tests
 *
 * 驗證目標：
 * T1: parseSafeAmount 安全解析各種金額格式
 * T2: calculateBudgetUsage 預算有效額度計算與 submitted/approved 累計
 * T3: calculateBudgetUsage draft/rejected/cancelled 不消耗預算
 * T4: calculateBudgetUsage 排除自表單 (避免更新既有請款單 double-count)
 * T5: calculateBudgetUsage 超額判定與超額金額
 * T6: serializePaymentRequest 完整輸出 projectId, vendorId, budgetType, budgetItemId
 * T7: deserializePaymentRequest 完整還原新規格表單
 * T8: deserializePaymentRequest 向後相容舊規格表單 (自動相容為 unbudgeted)
 */

import {
  serializePaymentRequest,
  deserializePaymentRequest,
} from '../src/services/formAdapters';
import {
  parseSafeAmount,
  calculateBudgetUsage,
} from '../src/services/budgetUsage';
import type { FormRecord } from '../src/models/backend';
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
// T1: parseSafeAmount 解析安全度
// ==========================================
assert(parseSafeAmount('1,234,567') === 1234567, 'T1.1: 千分位字串解析正常');
assert(parseSafeAmount(50000) === 50000, 'T1.2: 數值型別解析正常');
assert(parseSafeAmount('') === 0, 'T1.3: 空字串回傳 0');
assert(parseSafeAmount(null) === 0, 'T1.4: null 回傳 0');
assert(parseSafeAmount(undefined) === 0, 'T1.5: undefined 回傳 0');
assert(parseSafeAmount('abc') === 0, 'T1.6: 非法字串回傳 0');
assert(parseSafeAmount(-500) === 0, 'T1.7: 負數截斷為 0');

// ==========================================
// T2: calculateBudgetUsage 基本計算與累計
// ==========================================
const mockForms: FormRecord[] = [
  {
    formId: 'FRM-2026-000001',
    formType: 'payment_request',
    status: 'submitted',
    company: '昇陽開發實業股份有限公司',
    projectId: 'PRJ-001',
    projectName: '台北A案',
    vendorId: 'VND-001',
    vendorName: '台泥',
    vendorTaxId: '12345678',
    budgetType: 'budgeted',
    budgetItemId: 'BGT-001',
    amount: 300000,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    createdBy: 'user',
    payloadJson: '{}',
  },
  {
    formId: 'FRM-2026-000002',
    formType: 'payment_request',
    status: 'approved',
    company: '昇陽開發實業股份有限公司',
    projectId: 'PRJ-001',
    projectName: '台北A案',
    vendorId: 'VND-001',
    vendorName: '台泥',
    vendorTaxId: '12345678',
    budgetType: 'budgeted',
    budgetItemId: 'BGT-001',
    amount: 200000,
    createdAt: '2026-09-02T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
    createdBy: 'user',
    payloadJson: '{}',
  },
];

const usage1 = calculateBudgetUsage({
  budgetAmount: 1000000,
  terminatedAmount: 100000,
  forms: mockForms,
  selectedBudgetItemId: 'BGT-001',
  currentAmount: '250,000',
});

assert(usage1.budgetAmount === 1000000, 'T2.1: 原預算額正確');
assert(usage1.terminatedAmount === 100000, 'T2.2: 終止金額正確');
assert(usage1.effectiveBudget === 900000, 'T2.3: 有效預算額正確 (100萬 - 10萬 = 90萬)');
assert(usage1.usedOther === 500000, 'T2.4: submitted + approved 累計正確 (30萬 + 20萬 = 50萬)');
assert(usage1.currentAmount === 250000, 'T2.5: 本次請款額正確');
assert(usage1.remainingAfterCurrent === 150000, 'T2.6: 本次請款後餘額正確 (90萬 - 50萬 - 25萬 = 15萬)');
assert(usage1.isOverBudget === false, 'T2.7: 未超額');
assert(usage1.overAmount === 0, 'T2.8: 超額金額為 0');

// ==========================================
// T3: calculateBudgetUsage 排除狀態
// ==========================================
const mockFormsWithExcluded: FormRecord[] = [
  ...mockForms,
  {
    formId: 'FRM-2026-000003',
    formType: 'payment_request',
    status: 'draft',
    company: '昇陽開發實業股份有限公司',
    projectId: 'PRJ-001',
    projectName: '台北A案',
    vendorId: 'VND-001',
    vendorName: '台泥',
    vendorTaxId: '12345678',
    budgetType: 'budgeted',
    budgetItemId: 'BGT-001',
    amount: 100000,
    createdAt: '2026-09-03T00:00:00Z',
    updatedAt: '2026-09-03T00:00:00Z',
    createdBy: 'user',
    payloadJson: '{}',
  },
  {
    formId: 'FRM-2026-000004',
    formType: 'payment_request',
    status: 'rejected',
    company: '昇陽開發實業股份有限公司',
    projectId: 'PRJ-001',
    projectName: '台北A案',
    vendorId: 'VND-001',
    vendorName: '台泥',
    vendorTaxId: '12345678',
    budgetType: 'budgeted',
    budgetItemId: 'BGT-001',
    amount: 80000,
    createdAt: '2026-09-04T00:00:00Z',
    updatedAt: '2026-09-04T00:00:00Z',
    createdBy: 'user',
    payloadJson: '{}',
  },
  {
    formId: 'FRM-2026-000005',
    formType: 'payment_request',
    status: 'cancelled',
    company: '昇陽開發實業股份有限公司',
    projectId: 'PRJ-001',
    projectName: '台北A案',
    vendorId: 'VND-001',
    vendorName: '台泥',
    vendorTaxId: '12345678',
    budgetType: 'budgeted',
    budgetItemId: 'BGT-001',
    amount: 70000,
    createdAt: '2026-09-05T00:00:00Z',
    updatedAt: '2026-09-05T00:00:00Z',
    createdBy: 'user',
    payloadJson: '{}',
  },
];

const usageExcluded = calculateBudgetUsage({
  budgetAmount: 1000000,
  terminatedAmount: 0,
  forms: mockFormsWithExcluded,
  selectedBudgetItemId: 'BGT-001',
  currentAmount: 100000,
});
assert(usageExcluded.usedOther === 500000, 'T3.1: draft/rejected/cancelled 確實被排除在已消耗額之外');

// ==========================================
// T4: calculateBudgetUsage 排除自表單 (避免 double count)
// ==========================================
const usageSelfExcluded = calculateBudgetUsage({
  budgetAmount: 1000000,
  terminatedAmount: 0,
  forms: mockForms,
  selectedBudgetItemId: 'BGT-001',
  currentFormId: 'FRM-2026-000001',
  currentAmount: 350000,
});
assert(usageSelfExcluded.usedOther === 200000, 'T4.1: 更新既有請款單時排除自身先前額度 (僅累計 FRM-2026-000002 20萬)');
assert(usageSelfExcluded.remainingAfterCurrent === 450000, 'T4.2: 剩餘可用預算正確 (100萬 - 20萬 - 35萬 = 45萬)');

// ==========================================
// T5: calculateBudgetUsage 超額判定
// ==========================================
const usageOver = calculateBudgetUsage({
  budgetAmount: 600000,
  terminatedAmount: 0,
  forms: mockForms,
  selectedBudgetItemId: 'BGT-001',
  currentAmount: 150000,
});
assert(usageOver.isOverBudget === true, 'T5.1: 超出預算時 isOverBudget 判定為 true');
assert(usageOver.overAmount === 50000, 'T5.2: 超額金額正確 (超額 5 萬)');
assert(usageOver.remainingAfterCurrent === -50000, 'T5.3: 剩餘為負數');

// ==========================================
// T6: serializePaymentRequest 完整輸出主檔欄位
// ==========================================
const fullPaymentData: PaymentRequestData = {
  company: '昇陽開發實業股份有限公司',
  applyDate: '2026-09-15',
  projectId: 'PRJ-001',
  project: '台北A案',
  vendorId: 'VND-001',
  vendor: '台灣水泥股份有限公司',
  vendorTaxId: '11112222',
  budgetType: 'budgeted',
  budgetItemId: 'BGT-001',
  budgetItemName: '主體結構混凝土工程',
  requisitionNumber: 'REQ-001',
  department: '工務部',
  contractNumber: 'CTR-001',
  bankCode: '007',
  bankName: '第一商業銀行',
  branchCode: '1440',
  branchName: '安和分行',
  accountNameSameAsVendor: true,
  accountName: '台灣水泥股份有限公司',
  accountNumber: '14410123456',
  bankAccount: {
    type: 'code',
    bankCode: '007',
    bankName: '第一商業銀行',
    branch: '安和分行',
    accountName: '台灣水泥股份有限公司',
    accountNumber: '14410123456',
  },
  expenseNature: '工程款',
  contractTotal: '5,000,000',
  dueDate: '2026-10-15',
  currentAmount: '200,000',
  retentionAmount: '0',
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
  description: '請款驗收說明',
};

const serialized = serializePaymentRequest(fullPaymentData);
assert(serialized.projectId === 'PRJ-001', 'T6.1: serialize 輸出 projectId');
assert(serialized.projectName === '台北A案', 'T6.2: serialize 輸出 projectName');
assert(serialized.vendorId === 'VND-001', 'T6.3: serialize 輸出 vendorId');
assert(serialized.vendorName === '台灣水泥股份有限公司', 'T6.4: serialize 輸出 vendorName');
assert(serialized.vendorTaxId === '11112222', 'T6.5: serialize 輸出 vendorTaxId');
assert(serialized.budgetType === 'budgeted', 'T6.6: serialize 輸出 budgetType');
assert(serialized.budgetItemId === 'BGT-001', 'T6.7: serialize 輸出 budgetItemId');
assert(serialized.amount === 200000, 'T6.8: serialize 輸出 amount 數值');

// ==========================================
// T7: deserializePaymentRequest 完整還原新規格
// ==========================================
const mockRecord: FormRecord = {
  formId: 'FRM-2026-000010',
  formType: serialized.formType,
  status: serialized.status || 'submitted',
  company: serialized.company,
  projectId: serialized.projectId || '',
  projectName: serialized.projectName || '',
  vendorId: serialized.vendorId || '',
  vendorName: serialized.vendorName || '',
  vendorTaxId: serialized.vendorTaxId || '',
  budgetType: serialized.budgetType || 'budgeted',
  budgetItemId: serialized.budgetItemId || '',
  amount: serialized.amount || 0,
  createdAt: '2026-09-15T00:00:00Z',
  updatedAt: '2026-09-15T00:00:00Z',
  createdBy: 'user',
  payloadJson: serialized.payloadJson,
};

const deserialized = deserializePaymentRequest(mockRecord);
assert(deserialized.projectId === 'PRJ-001', 'T7.1: deserialize 還原 projectId');
assert(deserialized.vendorId === 'VND-001', 'T7.2: deserialize 還原 vendorId');
assert(deserialized.budgetType === 'budgeted', 'T7.3: deserialize 還原 budgetType');
assert(deserialized.budgetItemId === 'BGT-001', 'T7.4: deserialize 還原 budgetItemId');
assert(deserialized.budgetItemName === '主體結構混凝土工程', 'T7.5: deserialize 還原 budgetItemName');
assert(deserialized.currentAmount === '200,000', 'T7.6: deserialize 還原 currentAmount');

// ==========================================
// T8: 向後相容舊規格表單 (無 budgetItemId 自動為 unbudgeted)
// ==========================================
const legacyRecord: FormRecord = {
  formId: 'FRM-2026-000099',
  formType: 'payment_request',
  status: 'submitted',
  company: '昇陽開發實業股份有限公司',
  projectId: '',
  projectName: '手動專案X',
  vendorId: '',
  vendorName: '手動廠商Y',
  vendorTaxId: '88887777',
  budgetType: '',
  budgetItemId: '',
  amount: 50000,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  createdBy: 'user',
  payloadJson: JSON.stringify({
    company: '昇陽開發實業股份有限公司',
    applyDate: '2026-08-01',
    project: '手動專案X',
    vendor: '手動廠商Y',
    vendorTaxId: '88887777',
    currentAmount: '50,000',
    specialRequirements: {},
  }),
};

const legacyDeserialized = deserializePaymentRequest(legacyRecord);
assert(legacyDeserialized.project === '手動專案X', 'T8.1: 舊表單保留專案名稱');
assert(legacyDeserialized.vendor === '手動廠商Y', 'T8.2: 舊表單保留廠商名稱');
assert(legacyDeserialized.projectId === '', 'T8.3: 舊表單不捏造 projectId');
assert(legacyDeserialized.vendorId === '', 'T8.4: 舊表單不捏造 vendorId');
assert(legacyDeserialized.budgetItemId === '', 'T8.5: 舊表單不捏造 budgetItemId');
assert(legacyDeserialized.budgetType === 'unbudgeted', 'T8.6: 舊表單自動相容為 unbudgeted');

// ==========================================
// R3: 變更廠商時清除不相容之 BudgetItem
// ==========================================
function simulateVendorSelect(currentForm: PaymentRequestData, selectedBudgetItem: { vendorId?: string } | undefined, newVendorId: string) {
  const updates: Partial<PaymentRequestData> = {
    vendorId: newVendorId,
  };
  if (selectedBudgetItem && selectedBudgetItem.vendorId && selectedBudgetItem.vendorId.trim() !== '') {
    if (selectedBudgetItem.vendorId !== newVendorId) {
      updates.budgetItemId = '';
      updates.budgetItemName = '';
    }
  }
  return { ...currentForm, ...updates };
}

const formWithVendorA: PaymentRequestData = {
  ...fullPaymentData,
  projectId: 'PRJ-001',
  vendorId: 'VND-A',
  budgetItemId: 'BGT-001',
  budgetItemName: '工程項目',
};

const itemAssignedVendorA = { vendorId: 'VND-A' };

const switchedToB = simulateVendorSelect(formWithVendorA, itemAssignedVendorA, 'VND-B');
assert(switchedToB.vendorId === 'VND-B', 'R3.1: 成功切換為 Vendor B');
assert(switchedToB.budgetItemId === '', 'R3.2: 與項目指定廠商不符時清除 budgetItemId');
assert(switchedToB.budgetItemName === '', 'R3.3: 與項目指定廠商不符時清除 budgetItemName');
assert(switchedToB.projectId === 'PRJ-001', 'R3.4: projectId 完整保留不清除');

// ==========================================
// R4: 手動修改 Vendor 名稱時若清空 vendorId，且項目有指定廠商，一併清除 BudgetItem
// ==========================================
function simulateManualVendorChange(currentForm: PaymentRequestData, currentLinkedVendorName: string, newVendorName: string, selectedBudgetItem: { vendorId?: string } | undefined) {
  const shouldClearVendorId = currentLinkedVendorName !== newVendorName;
  const updates: Partial<PaymentRequestData> = {
    vendor: newVendorName,
    vendorId: shouldClearVendorId ? '' : currentForm.vendorId,
  };
  if (shouldClearVendorId && selectedBudgetItem && selectedBudgetItem.vendorId && selectedBudgetItem.vendorId.trim() !== '') {
    updates.budgetItemId = '';
    updates.budgetItemName = '';
  }
  return { ...currentForm, ...updates };
}

const manualSwitched = simulateManualVendorChange(formWithVendorA, '台灣水泥股份有限公司', '其他手動廠商', itemAssignedVendorA);
assert(manualSwitched.vendorId === '', 'R4.1: 手動修改名稱後 vendorId 被清除');
assert(manualSwitched.budgetItemId === '', 'R4.2: 項目有指定廠商時 budgetItemId 被一併清除');
assert(manualSwitched.budgetItemName === '', 'R4.3: 項目有指定廠商時 budgetItemName 被一併清除');
assert(manualSwitched.projectId === 'PRJ-001', 'R4.4: projectId 依然完整保留');

console.log(`\n測試總結：${passed} 通過，${failed} 失敗`);
if (failed > 0) process.exit(1);

