export type VendorEntityType = 'company' | 'branch' | 'business' | 'unknown';

export interface VendorLookupResult {
  found: boolean;
  taxId: string;
  entityType: VendorEntityType;
  name?: string;
  companyName?: string;
}

/**
 * 驗證統一編號邏輯
 * 依據財政部規範：
 * 1. 舊制（112年4月前）：加權加總須能被 10 整除
 * 2. 新制（112年4月起）：加權加總改為須能被 5 整除（向下完全相容舊制）
 * 3. 第 7 位為 7 時，乘積為 28，十位與個位和為 10，計入加總可為 0（或 10）或 1，任一滿足能被 5 整除即屬合法
 */
export function validateTaxId(taxId: string): boolean {
  const clean = (taxId || '').trim();
  if (!/^\d{8}$/.test(clean)) return false;

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum1 = 0;
  let sum2 = 0;

  for (let i = 0; i < 8; i++) {
    const digit = parseInt(clean[i], 10);
    const prod = digit * weights[i];
    const s = Math.floor(prod / 10) + (prod % 10);
    sum1 += s;
    if (i === 6 && digit === 7) {
      sum2 += 1;
    } else {
      sum2 += s;
    }
  }

  return sum1 % 5 === 0 || (clean[6] === '7' && sum2 % 5 === 0);
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
      return {
        found: false,
        taxId: cleanId,
        entityType: data.entityType || 'unknown',
      };
    }
    // 非 200 回應時安全降級，不中斷使用者操作
    return {
      found: false,
      taxId: cleanId,
      entityType: 'unknown',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    // 網路連線異常或逾時，平順回傳未查得，提示使用者手動輸入
    return {
      found: false,
      taxId: cleanId,
      entityType: 'unknown',
    };
  }
}
