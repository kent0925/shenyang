/**
 * 台灣統一編號 8 碼邏輯檢核
 * 乘數：[1, 2, 1, 2, 1, 2, 4, 1]
 * 邏輯：
 * 1. 各乘積之十位數與個位數相加。
 * 2. 總和若能被 10 整除則合法。
 * 3. 若第 7 位為 7，乘積為 28 (2+8=10)，則 (sum % 10 === 0) 或 ((sum + 1) % 10 === 0) 均合法。
 */
export function validateTaxId(taxId: string): boolean {
  const cleanId = (taxId || '').trim();
  if (!/^\d{8}$/.test(cleanId)) return false;

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;

  for (let i = 0; i < 8; i++) {
    const num = parseInt(cleanId[i], 10);
    const prod = num * weights[i];
    // 十位數與個位數相加
    sum += Math.floor(prod / 10) + (prod % 10);
  }

  if (sum % 10 === 0) return true;

  // 第 7 位是 7 的特殊規則 (7*4=28 => 2+8=10 或 1+0=1)
  if (cleanId[6] === '7' && (sum + 1) % 10 === 0) {
    return true;
  }

  return false;
}

export interface CompanyLookupResult {
  taxId: string;
  companyName: string;
}

/**
 * 透過經濟部商工登記公開資料查詢公司名稱
 * 優先呼叫 Vercel Serverless Function Proxy (/api/company)，
 * 若本機開發/預覽未啟用 Serverless 或網路失敗，則備援嘗試公開端點。
 */
export async function lookupCompanyByTaxId(taxId: string): Promise<CompanyLookupResult | null> {
  const cleanId = (taxId || '').trim();
  if (!validateTaxId(cleanId)) {
    throw new Error('統一編號格式不正確，請輸入合法的 8 位數字');
  }

  let errorDetail: string | null = null;

  // 1. 優先透過本站 Vercel Proxy API 轉送經濟部官方商工 API
  try {
    const res = await fetch(`/api/company?taxId=${cleanId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.companyName) {
        return {
          taxId: cleanId,
          companyName: data.companyName.trim(),
        };
      }
      if (data.found === false) {
        return null; // 查無資料
      }
    } else {
      errorDetail = `API HTTP ${res.status}`;
    }
  } catch (err: any) {
    errorDetail = err.message || String(err);
  }

  // 2. 備援嘗試：使用台灣開放資料公開鏡像 (company.g0v.ronny.tw)
  try {
    const fallbackRes = await fetch(`https://company.g0v.ronny.tw/api/show/${cleanId}`);
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      if (fbData && fbData.data) {
        const name = fbData.data['公司名稱'] || fbData.data['商業名稱'] || fbData.data['營業人名稱'];
        if (name) {
          return {
            taxId: cleanId,
            companyName: name.trim(),
          };
        }
      }
      return null;
    }
  } catch (fbErr: any) {
    // 兩者皆失敗
  }

  if (errorDetail) {
    throw new Error(`公司資料服務連線失敗 (${errorDetail})，請稍候重試或手動輸入`);
  }

  return null;
}
