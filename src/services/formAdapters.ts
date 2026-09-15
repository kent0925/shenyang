/**
 * src/services/formAdapters.ts - 表單資料與後端 FormRecord 之適配轉換器
 *
 * 核心責任：
 * 1. SealApprovalData <-> SaveFormPayload / FormRecord 雙向適配轉換。
 * 2. PaymentRequestData <-> SaveFormPayload / FormRecord 雙向適配轉換。
 * 3. 嚴格確保 formType 完整性（不得跨類型還原）。
 * 4. 安全序列化與反序列化，防範損毀之 JSON 導致應用程式崩潰。
 * 5. 絕不在日誌中輸出任何敏感表單或金流內容。
 */

import { SealApprovalData, INITIAL_SEAL_APPROVAL_DATA } from '../models/sealApproval';
import { PaymentRequestData, INITIAL_PAYMENT_REQUEST_DATA } from '../models/paymentRequest';
import type { SaveFormPayload, FormRecord } from '../models/backend';

/**
 * 由 YYYY-MM-DD 或 ISO 日期字串提取西元年份
 */
export function extractYearFromDate(dateStr?: string): number {
  if (!dateStr) return new Date().getFullYear();
  const match = dateStr.match(/^(\d{4})/);
  if (match && match[1]) {
    const y = parseInt(match[1], 10);
    if (Number.isInteger(y) && y > 1900 && y < 2100) return y;
  }
  return new Date().getFullYear();
}

/**
 * 安全解析數值金額（嚴禁使用 parseInt 截斷金額）
 */
export function parseSafeAmount(val?: string | number): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  const cleaned = String(val).replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

// ==========================================
// 1. 用印／簽呈表單 (Seal Approval)
// ==========================================

/**
 * 將 SealApprovalData 轉換為後端 SaveFormPayload
 *
 * Metadata 對應原則：
 * - company: sealData.company (必填)
 * - year: 提取自 sealData.applyDate (例如 2026)
 * - formType: 'seal_approval'
 * - formId: 若為已載入既有表單則帶入，若為新建則為 undefined（由後端產生）
 * - payloadJson: JSON.stringify(sealData)
 * - 其餘未包含之欄位（如 vendor, amount 等）保持 undefined，絕不憑空捏造
 */
export function serializeSealApproval(data: SealApprovalData, formId?: string): SaveFormPayload {
  const year = extractYearFromDate(data.applyDate);

  const payload: SaveFormPayload = {
    formType: 'seal_approval',
    company: data.company.trim(),
    year,
    status: 'submitted',
    payloadJson: JSON.stringify(data),
  };

  if (formId && formId.trim() !== '') {
    payload.formId = formId.trim();
  }

  return payload;
}

/**
 * 將後端 FormRecord 安全還原為 SealApprovalData
 */
export function deserializeSealApproval(record: FormRecord): SealApprovalData {
  if (record.formType !== 'seal_approval') {
    throw new Error(`表單類型不符：預期為 seal_approval，但收到了 ${record.formType}`);
  }

  if (!record.payloadJson) {
    throw new Error('表單資料為空 (缺少 payloadJson)');
  }

  try {
    const raw = typeof record.payloadJson === 'string'
      ? JSON.parse(record.payloadJson)
      : record.payloadJson;

    if (!raw || typeof raw !== 'object') {
      throw new Error('表單資料格式無效');
    }

    // 與 INITIAL_SEAL_APPROVAL_DATA 進行合併，確保新舊版本欄位齊全
    return {
      ...INITIAL_SEAL_APPROVAL_DATA,
      ...raw,
      company: raw.company || record.company || INITIAL_SEAL_APPROVAL_DATA.company,
      types: Array.isArray(raw.types) ? raw.types : INITIAL_SEAL_APPROVAL_DATA.types,
      subject: raw.subject || '',
      description: raw.description || '',
    };
  } catch (err: any) {
    throw new Error(`此表單資料格式無法讀取：${err.message || 'JSON 解析失敗'}`);
  }
}

// ==========================================
// 2. 請款單 (Payment Request)
// ==========================================

/**
 * 將 PaymentRequestData 轉換為後端 SaveFormPayload
 *
 * Metadata 對應原則：
 * - company: paymentData.company (必填)
 * - year: 提取自 paymentData.applyDate (例如 2026)
 * - formType: 'payment_request'
 * - formId: 若為已載入既有表單則帶入，新建則為 undefined
 * - projectId: paymentData.projectId (若有)
 * - projectName: paymentData.project
 * - vendorId: paymentData.vendorId (若有)
 * - vendorName: paymentData.vendor
 * - vendorTaxId: paymentData.vendorTaxId
 * - amount: parseSafeAmount(paymentData.currentAmount)
 * - budgetType: paymentData.budgetType || 'budgeted'
 * - budgetItemId: paymentData.budgetItemId (若有)
 * - payloadJson: JSON.stringify(paymentData)
 */
export function serializePaymentRequest(data: PaymentRequestData, formId?: string): SaveFormPayload {
  const year = extractYearFromDate(data.applyDate);
  const amount = parseSafeAmount(data.currentAmount);

  const payload: SaveFormPayload = {
    formType: 'payment_request',
    company: data.company.trim(),
    year,
    projectId: data.projectId ? data.projectId.trim() : undefined,
    projectName: data.project ? data.project.trim() : undefined,
    subProjectId: data.subProjectId ? data.subProjectId.trim() : undefined,
    subProjectName: data.subProjectName ? data.subProjectName.trim() : undefined,
    vendorId: data.vendorId ? data.vendorId.trim() : undefined,
    vendorName: data.vendor ? data.vendor.trim() : undefined,
    vendorTaxId: data.vendorTaxId ? data.vendorTaxId.trim() : undefined,
    amount,
    budgetType: data.budgetType || 'budgeted',
    budgetItemId: data.budgetItemId ? data.budgetItemId.trim() : undefined,
    status: 'submitted',
    payloadJson: JSON.stringify(data),
  };

  if (formId && formId.trim() !== '') {
    payload.formId = formId.trim();
  }

  return payload;
}

/**
 * 將後端 FormRecord 安全還原為 PaymentRequestData
 *
 * 向後相容規則：
 * 1. 新資料：完整還原 projectId, vendorId, budgetType, budgetItemId, budgetItemName。
 * 2. 舊資料：若無 budgetItemId，自動視為 unbudgeted，避免歷史表單因缺少 budgetItemId 無法開啟。
 */
export function deserializePaymentRequest(record: FormRecord): PaymentRequestData {
  if (record.formType !== 'payment_request') {
    throw new Error(`表單類型不符：預期為 payment_request，但收到了 ${record.formType}`);
  }

  if (!record.payloadJson) {
    throw new Error('表單資料為空 (缺少 payloadJson)');
  }

  try {
    const raw = typeof record.payloadJson === 'string'
      ? JSON.parse(record.payloadJson)
      : record.payloadJson;

    if (!raw || typeof raw !== 'object') {
      throw new Error('表單資料格式無效');
    }

    const resolvedBudgetItemId = raw.budgetItemId || record.budgetItemId || '';
    // 若無 budgetItemId 且未明確指定，向後相容設為 unbudgeted
    const resolvedBudgetType: 'budgeted' | 'unbudgeted' =
      raw.budgetType === 'unbudgeted'
        ? 'unbudgeted'
        : resolvedBudgetItemId
        ? 'budgeted'
        : 'unbudgeted';

    // 與 INITIAL_PAYMENT_REQUEST_DATA 進行深層合併保護
    return {
      ...INITIAL_PAYMENT_REQUEST_DATA,
      ...raw,
      company: raw.company || record.company || INITIAL_PAYMENT_REQUEST_DATA.company,
      projectId: raw.projectId || record.projectId || '',
      project: raw.project || record.projectName || '',
      subProjectId: raw.subProjectId || record.subProjectId || '',
      subProjectName: raw.subProjectName || record.subProjectName || '',
      vendorId: raw.vendorId || record.vendorId || '',
      vendor: raw.vendor || record.vendorName || '',
      vendorTaxId: raw.vendorTaxId || record.vendorTaxId || '',
      budgetType: resolvedBudgetType,
      budgetItemId: resolvedBudgetItemId,
      budgetItemName: raw.budgetItemName || '',
      bankAccount: {
        ...INITIAL_PAYMENT_REQUEST_DATA.bankAccount,
        ...(raw.bankAccount || {}),
      },
      specialRequirements: {
        ...INITIAL_PAYMENT_REQUEST_DATA.specialRequirements,
        ...(raw.specialRequirements || {}),
      },
    };
  } catch (err: any) {
    throw new Error(`此表單資料格式無法讀取：${err.message || 'JSON 解析失敗'}`);
  }
}
