import { BankAccountInfo, PaymentRequestData } from '../models/paymentRequest';

export function formatBankAccount(
  info?: Partial<BankAccountInfo>,
  data?: Partial<PaymentRequestData>
): string {
  const bankCode = (data?.bankCode || info?.bankCode || '').trim();
  const bankName = (data?.bankName || info?.bankName || '').trim();
  const branchName = (data?.branchName || info?.branch || '').trim();
  const accountName = (data?.accountName || info?.accountName || '').trim();
  const accountNumber = (data?.accountNumber || info?.accountNumber || '').trim();

  const bankParts = [bankCode, bankName, branchName].filter(Boolean).join(' ');
  const parts: string[] = [];

  if (bankParts) {
    parts.push(`銀行：${bankParts}`);
  }
  if (accountName) {
    parts.push(`戶名：${accountName}`);
  }
  if (accountNumber) {
    parts.push(`帳號：${accountNumber}`);
  }

  return parts.join(' / ');
}

export function formatPaymentBankAccount(data: PaymentRequestData): string {
  return formatBankAccount(data.bankAccount, data);
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
