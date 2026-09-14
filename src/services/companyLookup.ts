/**
 * 台灣營利事業統一編號 8 碼檢核（依財政部 112 年 4 月 1 日新制擴增邏輯）
 * 乘數：[1, 2, 1, 2, 1, 2, 4, 1]
 * 規則：
 * 1. 統一編號每位數字與對應權重相乘。
 * 2. 各乘積若為兩位數，則十位數與個位數相加，再將所有數值加總 (sum)。
 * 3. 檢查規則（新制）：總和除以 5 的餘數為 0 則為合法 (sum % 5 === 0)。
 * 4. 第 7 碼為 7 的特殊情況：乘積為 28 (2+8=10)，若 (sum % 5 !== 0)，
 *    則將總和加 1 判定：((sum + 1) % 5 === 0) 亦為合法。
 */
export function validateTaxId(taxId: string): boolean {
  const cleanId = (taxId || '').trim();
  if (!/^\d{8}$/.test(cleanId)) return false;

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    const num = parseInt(cleanId[i], 10);
    const prod = num * weights[i];
    sum += Math.floor(prod / 10) + (prod % 10);
  }

  // 112 年 4 月 1 日新制：除數為 5 (相容舊制能被 10 整除者)
  if (sum % 5 === 0) return true;

  // 第 7 位是 7 的特殊規則 (7*4=28 => 2+8=10 或 1+0=1)
  if (cleanId[6] === '7' && (sum + 1) % 5 === 0) {
    return true;
  }

  return false;
}

export type VendorEntityType = 'company' | 'branch' | 'business' | 'unknown';

export interface VendorLookupResult {
  found: boolean;
  taxId: string;
  entityType: VendorEntityType;
  name?: string;
  companyName?: string;
}

export type CompanyLookupResult = VendorLookupResult;

/**
 * 透過經濟部商工登記公開資料查詢公司／商業／分公司名稱
 * 嚴格遵循隱私與資安規範：僅透過本站 Vercel Serverless Function Proxy (/api/company) 轉送經濟部官方商工 API。
 * 支援傳入 AbortSignal 避免 Race Condition。
 * 絕不使用任何第三方非官方服務或鏡像。
 */
export async function lookupCompanyByTaxId(
  taxId: string,
  signal?: AbortSignal
): Promise<VendorLookupResult | null> {
  const cleanId = (taxId || '').trim();
  if (!validateTaxId(cleanId)) {
    throw new Error('統一編號格式不正確，請輸入合法的 8 位數字');
  }

  try {
    const res = await fetch(`/api/company?taxId=${cleanId}`, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data.found && (data.name || data.companyName)) {
        const resolvedName = (data.name || data.companyName).trim();
        return {
          found: true,
          taxId: cleanId,
          entityType: data.entityType || 'company',
          name: resolvedName,
          companyName: resolvedName,
        };
      }
      if (data.found === false) {
        return {
          found: false,
          taxId: cleanId,
          entityType: data.entityType || 'unknown',
        };
      }
    }
    // 非 200 回應（如 500, 502 等）
    throw new Error('公司資料服務暫時無法使用，請稍後再試或手動輸入廠商名稱。');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    // 網路錯誤、HTTP 錯誤或政府服務無回應
    if (err.message === '公司資料服務暫時無法使用，請稍後再試或手動輸入廠商名稱。') {
      throw err;
    }
    throw new Error('公司資料服務暫時無法使用，請稍後再試或手動輸入廠商名稱。');
  }
}
