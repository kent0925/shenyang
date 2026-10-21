import type { PaymentRequestData } from '../models/paymentRequest';
import type { Vendor, VendorBankAccount, SaveVendorPayload } from '../models/backend';
import { backendStorageService } from './backendStorage';
import { validateTaxId } from './companyLookup';

/**
 * 正規化金融機構代碼（純數字補滿 3 碼，如 '13' -> '013'）
 */
export function normalizeBankCode(codeOrName?: string): string {
  if (!codeOrName) return '';
  const s = codeOrName.trim();
  if (/^\d+$/.test(s)) {
    return s.padStart(3, '0');
  }
  return s;
}

/**
 * 正規化銀行帳號（去除空白、破折號，並去除開頭多餘前導 0）
 * 例如 '054035011911' 與 '54035011911' -> '54035011911'
 */
export function normalizeAccountNumber(accountNumber?: string): string {
  if (!accountNumber) return '';
  const clean = accountNumber.trim().replace(/[\s-]/g, '');
  const stripped = clean.replace(/^0+/, '');
  return stripped || '0';
}

/**
 * 產生銀行帳號的唯一去重 Key
 * 台灣銀行主機帳務中，同銀行帳號去除前導 0 後具唯一性（分行碼常已內含於帳號前 3~4 碼中）
 * 為容錯銀行代碼長度（如 '13' 與 '013'）及帳號有無前導 0（如 '054035011911' 與 '54035011911'）：
 * 組合：normBankCode + '|' + normAccountNumber
 */
export function getBankAccountKey(account: {
  bankCode?: string;
  bankName?: string;
  branchCode?: string;
  branchName?: string;
  accountNumber?: string;
}): string {
  const bank = normalizeBankCode(account.bankCode || account.bankName || '');
  const num = normalizeAccountNumber(account.accountNumber || '');
  if (!bank && !num) return '';
  return `${bank}|${num}`;
}

/**
 * 從請款單資料中擷取銀行帳號明細
 */
export function extractBankAccountFromPayment(data: PaymentRequestData): VendorBankAccount | null {
  const accountNumber = (data.bankAccount?.accountNumber || data.accountNumber || '').trim();
  const bankCode = (data.bankAccount?.bankCode || data.bankCode || '').trim();
  const bankName = (data.bankAccount?.bankName || data.bankName || '').trim();
  const branchCode = (data.branchCode || '').trim();
  const branchName = (data.bankAccount?.branch || data.branchName || '').trim();
  const accountName = (data.bankAccount?.accountName || data.accountName || data.vendor || '').trim();

  // 若帳號、銀行代碼皆無，視為無匯款帳號資料
  if (!accountNumber && !bankCode && !bankName) {
    return null;
  }

  return {
    bankCode,
    bankName,
    branchCode,
    branchName,
    accountName,
    accountNumber,
  };
}

/**
 * 請款單儲存成功後，非同步同步／補充廠商主檔與匯款帳號清單
 * 規則：
 * 1. taxId 有值且合規（8 碼）、且主檔不存在該 taxId 才新建。
 * 2. 主檔已存在該廠商／taxId：不重複建、不覆寫既有值、僅補齊空白欄位。
 * 3. 匯款帳號以 (銀行+帳號) 智慧去重，相同不重複新增，若新資料更完整則進行補齊升級，歷史帳號不刪除。
 */
export async function syncVendorMasterAfterPaymentSave(data: PaymentRequestData): Promise<void> {
  const cleanTaxId = (data.vendorTaxId || '').trim();
  const vendorName = (data.vendor || '').trim();
  const vendorId = (data.vendorId || '').trim();

  const isTaxIdValid = cleanTaxId.length === 8 && validateTaxId(cleanTaxId);

  // 若無 vendorId 也無有效 8 碼統編，不符合自動建檔或比對條件
  if (!vendorId && !isTaxIdValid) {
    return;
  }

  const vendors = await backendStorageService.listVendors();
  let matchedVendor: Vendor | undefined;

  if (vendorId) {
    matchedVendor = vendors.find((v) => v.vendorId === vendorId);
  }

  if (!matchedVendor && isTaxIdValid) {
    matchedVendor = vendors.find((v) => (v.taxId || '').trim() === cleanTaxId);
  }

  const currentAcc = extractBankAccountFromPayment(data);

  if (matchedVendor) {
    // 已存在主檔：不覆寫既有值，僅補齊空白欄位，並追加／升級銀行帳號
    let accounts: VendorBankAccount[] = [];
    if (matchedVendor.bankAccounts && Array.isArray(matchedVendor.bankAccounts) && matchedVendor.bankAccounts.length > 0) {
      accounts = [...matchedVendor.bankAccounts];
    } else if (matchedVendor.accountNumber || matchedVendor.bankCode) {
      accounts = [{
        bankCode: matchedVendor.bankCode || '',
        bankName: matchedVendor.bankName || '',
        branchCode: matchedVendor.branchCode || '',
        branchName: matchedVendor.branchName || '',
        accountName: matchedVendor.accountName || matchedVendor.vendorName || '',
        accountNumber: matchedVendor.accountNumber || '',
      }];
    }

    let accountsUpdated = false;
    if (currentAcc && currentAcc.accountNumber) {
      const currentKey = getBankAccountKey(currentAcc);
      const existingIndex = accounts.findIndex((acc) => getBankAccountKey(acc) === currentKey);

      if (existingIndex >= 0) {
        // 已存在相同帳號：進行資訊升級補齊（例如補齊分行代碼、分行名稱、保留更長含前導 0 帳號）
        const old = accounts[existingIndex];
        let hasUpgrade = false;

        const updatedAcc: VendorBankAccount = { ...old };

        // 帳號號碼：優先保留較長且完整者（含前導 0）
        if (currentAcc.accountNumber.length > (old.accountNumber || '').length) {
          updatedAcc.accountNumber = currentAcc.accountNumber;
          hasUpgrade = true;
        }

        // 銀行代碼：若舊的非 3 碼，新的為 3 碼則升級
        if ((!old.bankCode || old.bankCode.length < 3) && currentAcc.bankCode && currentAcc.bankCode.length === 3) {
          updatedAcc.bankCode = currentAcc.bankCode;
          hasUpgrade = true;
        }

        // 銀行名稱：若舊的為空，補齊
        if (!old.bankName && currentAcc.bankName) {
          updatedAcc.bankName = currentAcc.bankName;
          hasUpgrade = true;
        }

        // 分行代碼與名稱：若舊的為空，補齊
        if (!old.branchCode && currentAcc.branchCode) {
          updatedAcc.branchCode = currentAcc.branchCode;
          hasUpgrade = true;
        }
        if (!old.branchName && currentAcc.branchName) {
          updatedAcc.branchName = currentAcc.branchName;
          hasUpgrade = true;
        }

        // 戶名：若舊的為空或舊的只是廠商名稱而新的是更完整戶名（如「東勛工程行陳品嘉」），進行升級更新
        if (currentAcc.accountName && (!old.accountName || (old.accountName === matchedVendor.vendorName && currentAcc.accountName !== matchedVendor.vendorName))) {
          updatedAcc.accountName = currentAcc.accountName;
          hasUpgrade = true;
        }

        if (hasUpgrade) {
          accounts[existingIndex] = updatedAcc;
          accountsUpdated = true;
        }
      } else {
        accounts.push(currentAcc);
        accountsUpdated = true;
      }
    }

    const payload: SaveVendorPayload = {
      vendorId: matchedVendor.vendorId,
      // 不覆寫既有值，僅補齊空白
      vendorName: matchedVendor.vendorName || vendorName,
      taxId: matchedVendor.taxId || (isTaxIdValid ? cleanTaxId : undefined),
      entityType: matchedVendor.entityType || '公司',
      bankCode: matchedVendor.bankCode || currentAcc?.bankCode || '',
      bankName: matchedVendor.bankName || currentAcc?.bankName || '',
      branchCode: matchedVendor.branchCode || currentAcc?.branchCode || '',
      branchName: matchedVendor.branchName || currentAcc?.branchName || '',
      accountName: matchedVendor.accountName || currentAcc?.accountName || '',
      accountNumber: matchedVendor.accountNumber || currentAcc?.accountNumber || '',
      bankAccounts: accounts,
      isActive: matchedVendor.isActive !== undefined ? matchedVendor.isActive : true,
    };

    // 檢查是否有實質補齊或追加帳號才更新
    const needsUpdate =
      accountsUpdated ||
      (!matchedVendor.taxId && isTaxIdValid) ||
      (!matchedVendor.bankCode && currentAcc?.bankCode) ||
      (!matchedVendor.accountNumber && currentAcc?.accountNumber);

    if (needsUpdate) {
      await backendStorageService.saveVendor(payload);
    }
  } else if (isTaxIdValid && vendorName) {
    // 不存在該統編：新建廠商主檔
    const accounts: VendorBankAccount[] = [];
    if (currentAcc && currentAcc.accountNumber) {
      accounts.push(currentAcc);
    }

    const newPayload: SaveVendorPayload = {
      vendorName,
      taxId: cleanTaxId,
      entityType: '公司',
      bankCode: currentAcc?.bankCode || '',
      bankName: currentAcc?.bankName || '',
      branchCode: currentAcc?.branchCode || '',
      branchName: currentAcc?.branchName || '',
      accountName: currentAcc?.accountName || vendorName,
      accountNumber: currentAcc?.accountNumber || '',
      bankAccounts: accounts,
      isActive: true,
    };

    await backendStorageService.saveVendor(newPayload);
  }
}
