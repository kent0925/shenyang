import type { PaymentRequestData } from '../models/paymentRequest';
import type { Vendor, VendorBankAccount, SaveVendorPayload } from '../models/backend';
import { backendStorageService } from './backendStorage';
import { validateTaxId } from './companyLookup';

/**
 * 產生銀行帳號的唯一去重 Key
 * 組合：(bankCode 或 bankName) + '|' + (branchCode 或 branchName) + '|' + accountNumber
 */
export function getBankAccountKey(account: {
  bankCode?: string;
  bankName?: string;
  branchCode?: string;
  branchName?: string;
  accountNumber?: string;
}): string {
  const bank = (account.bankCode || account.bankName || '').trim();
  const branch = (account.branchCode || account.branchName || '').trim();
  const num = (account.accountNumber || '').trim();
  return `${bank}|${branch}|${num}`;
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
 * 3. 匯款帳號以 (銀行+分行+帳號) 去重，相同不重複新增，不同帳號追加，歷史帳號不刪除。
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
    // 已存在主檔：不覆寫既有值，僅補齊空白欄位，並追加新銀行帳號
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
      const exists = accounts.some((acc) => getBankAccountKey(acc) === currentKey);
      if (!exists) {
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
