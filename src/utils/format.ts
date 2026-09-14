import { BankAccountInfo } from '../models/paymentRequest';

/**
 * 格式化銀行帳號為純文字（供寫入 Excel N7 儲存格與顯示）
 */
export function formatBankAccount(info: BankAccountInfo): string {
  const parts: string[] = [];

  if (info.type === 'code') {
    let bankStr = info.bankCode ? `銀行代碼:${info.bankCode}` : '';
    if (info.branch) {
      bankStr += bankStr ? `-${info.branch}` : `分行:${info.branch}`;
    }
    if (bankStr) parts.push(bankStr);
  } else {
    let bankStr = info.bankName ? `銀行:${info.bankName}` : '';
    if (info.branch) {
      bankStr += bankStr ? ` ${info.branch}` : `分行:${info.branch}`;
    }
    if (bankStr) parts.push(bankStr);
  }

  if (info.accountName) {
    parts.push(`戶名:${info.accountName}`);
  }

  if (info.accountNumber) {
    parts.push(`帳號:${info.accountNumber}`);
  }

  return parts.join('\n');
}

/**
 * 計算請款單實付金額（前端預覽計算用，Excel 內仍維持原生公式）
 * 公式：(1)請款 - (2)保留 - (3)預付沖銷 - (4)罰扣折讓
 */
export function calculatePayableAmount(
  current: string,
  retention: string,
  advance: string,
  penalty: string
): number {
  const c = parseFloat(current.replace(/,/g, '')) || 0;
  const r = parseFloat(retention.replace(/,/g, '')) || 0;
  const a = parseFloat(advance.replace(/,/g, '')) || 0;
  const p = parseFloat(penalty.replace(/,/g, '')) || 0;
  return c - r - a - p;
}

export function formatCurrency(val: number | string): string {
  if (val === '' || val === null || val === undefined) return '';
  const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
  if (isNaN(num)) return '';
  return num.toLocaleString('zh-TW');
}
