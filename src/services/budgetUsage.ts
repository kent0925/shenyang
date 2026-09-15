/**
 * src/services/budgetUsage.ts - 請款單預算額度與使用量純計算模組
 *
 * 核心規範：
 * 1. 預算消耗狀態：submitted, approved。
 * 2. 排除狀態：draft, rejected, cancelled。
 * 3. 排除自表單：更新既有請款單時 (currentFormId === form.formId)，必須排除該筆已記錄金額，避免 double count。
 * 4. 金額安全：使用 Number.isFinite 驗證，禁止 NaN / Infinity，空值或無效字串回傳 0。
 */

import type { FormRecord } from '../models/backend';

export const BUDGET_CONSUMING_STATUSES = ['submitted', 'approved'] as const;
export const BUDGET_EXCLUDED_STATUSES = ['draft', 'rejected', 'cancelled'] as const;

export interface BudgetUsageSummary {
  budgetAmount: number;           // 項目原預算額
  terminatedAmount: number;       // 終止額
  effectiveBudget: number;        // 有效預算 = budgetAmount - terminatedAmount
  usedOther: number;              // 其他已核銷/送審請款總額 (排除 currentFormId)
  remainingBeforeCurrent: number; // 本次請款前可用餘額 = effectiveBudget - usedOther
  currentAmount: number;          // 本次請款額
  remainingAfterCurrent: number;  // 本次請款後可用餘額 = remainingBeforeCurrent - currentAmount
  isOverBudget: boolean;          // 是否超額 (remainingAfterCurrent < 0)
  overAmount: number;             // 超額金額 (若無超額為 0)
}

/**
 * 安全解析千分位字串或數值金額
 */
export function parseSafeAmount(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.max(0, val) : 0;
  }
  const clean = String(val).replace(/,/g, '').trim();
  if (!clean) return 0;
  const num = Number(clean);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

/**
 * 計算單一預算項目的預算消耗與剩餘餘額
 */
export function calculateBudgetUsage(params: {
  budgetAmount?: number;
  terminatedAmount?: number;
  forms: Array<FormRecord | { formId?: string; budgetItemId?: string; status?: string; amount?: number }>;
  selectedBudgetItemId: string;
  currentFormId?: string;
  currentAmount: string | number;
}): BudgetUsageSummary {
  const {
    budgetAmount = 0,
    terminatedAmount = 0,
    forms,
    selectedBudgetItemId,
    currentFormId,
    currentAmount: currentAmountInput,
  } = params;

  // 1. 計算項目有效預算
  const bAmount = Number.isFinite(budgetAmount) ? Math.max(0, budgetAmount) : 0;
  const tAmount = Number.isFinite(terminatedAmount) ? Math.max(0, terminatedAmount) : 0;
  const effectiveBudget = Math.max(0, bAmount - tAmount);

  // 2. 加總同 budgetItemId、消耗狀態且非自表單的請款額
  let usedOther = 0;
  if (selectedBudgetItemId && Array.isArray(forms)) {
    for (const f of forms) {
      if (!f) continue;
      // 必須為同一個預算項目
      if (f.budgetItemId !== selectedBudgetItemId) continue;

      // 必須在消耗狀態內 (submitted, approved)
      const st = (f.status || '').toLowerCase();
      if (!BUDGET_CONSUMING_STATUSES.includes(st as any)) continue;

      // 關鍵核心防線：排除自己 (更新表單時)
      if (currentFormId && f.formId === currentFormId) continue;

      const amt = Number(f.amount);
      if (Number.isFinite(amt) && amt > 0) {
        usedOther += amt;
      }
    }
  }

  // 3. 計算本次請款額
  const parsedCurrent = parseSafeAmount(currentAmountInput);

  // 4. 計算餘額
  const remainingBeforeCurrent = effectiveBudget - usedOther;
  const remainingAfterCurrent = remainingBeforeCurrent - parsedCurrent;
  const isOverBudget = remainingAfterCurrent < 0;
  const overAmount = isOverBudget ? Math.abs(remainingAfterCurrent) : 0;

  return {
    budgetAmount: bAmount,
    terminatedAmount: tAmount,
    effectiveBudget,
    usedOther,
    remainingBeforeCurrent,
    currentAmount: parsedCurrent,
    remainingAfterCurrent,
    isOverBudget,
    overAmount,
  };
}
