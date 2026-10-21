import { BankAccountInfo, PaymentRequestData } from '../models/paymentRequest';

export function formatBankAccount(
  info?: Partial<BankAccountInfo>,
  data?: Partial<PaymentRequestData>
): string {
  let bankCode = (data?.bankCode || info?.bankCode || '').trim();
  const bankName = (data?.bankName || info?.bankName || '').trim();
  const branchName = (data?.branchName || info?.branch || '').trim();
  // 完整保全戶名：若同時存在多筆，優先選取最完整（含負責人姓名）之戶名，絕不擅自縮減
  const candidateNames = [
    data?.bankAccount?.accountName,
    data?.accountName,
    info?.accountName
  ].map(n => (n || '').trim()).filter(Boolean);
  candidateNames.sort((a, b) => b.length - a.length);
  const accountName = candidateNames[0] || '';
  let accountNumber = (data?.accountNumber || info?.accountNumber || '').trim();

  // 1. 銀行代碼都要三碼，若為 0 也要顯示（例如 13 -> 013, 4 -> 004）
  if (bankCode) {
    const digitMatch = bankCode.match(/\d+/);
    if (digitMatch) {
      const digits = digitMatch[0];
      if (digits.length <= 3) {
        bankCode = digits.padStart(3, '0');
      } else {
        // 若為 7 碼等分行代碼，前 3 碼為總機構代碼
        bankCode = digits.slice(0, 3).padStart(3, '0');
      }
    }
  }

  // 2. 帳號前導 0 智慧補齊（例如國泰世華 013 標準為 12 碼，若純數字且為 11 碼則自動補 0）
  if (accountNumber && /^\d+$/.test(accountNumber)) {
    if (bankCode === '013' && accountNumber.length === 11) {
      accountNumber = accountNumber.padStart(12, '0');
    } else if (bankCode === '004' && accountNumber.length === 11) {
      accountNumber = accountNumber.padStart(12, '0');
    } else if (bankCode === '822' && accountNumber.length === 11) {
      accountNumber = accountNumber.padStart(12, '0');
    }
  }

  // 3. 依結構分行呈現：
  // 第 1 行：(銀行全稱) (代碼)
  // 第 2 行：分行名 / 戶名
  // 第 3 行：帳號：
  const lines: string[] = [];

  let bankLine = '';
  if (bankName && bankCode) {
    bankLine = `${bankName} (${bankCode})`;
  } else if (bankName) {
    bankLine = bankName;
  } else if (bankCode) {
    bankLine = `(${bankCode})`;
  }
  if (bankLine) {
    lines.push(bankLine);
  }

  const secondLineParts: string[] = [];
  if (branchName) {
    secondLineParts.push(branchName);
  }
  if (accountName) {
    secondLineParts.push(`戶名：${accountName}`);
  }
  if (secondLineParts.length > 0) {
    lines.push(secondLineParts.join(' / '));
  }

  if (accountNumber) {
    lines.push(`帳號：${accountNumber}`);
  }

  return lines.join('\n');
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
