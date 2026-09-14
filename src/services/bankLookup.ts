export interface BankBranch {
  code: string; // 4 碼 (例如 1440) 或 完整代碼
  fullCode: string; // 7 碼 (例如 0071440)
  name: string; // 分行名稱 (例如 城東分行)
}

export interface BankItem {
  code: string; // 3 碼銀行代碼 (例如 007)
  name: string; // 銀行名稱 (例如 第一商業銀行)
  branches: BankBranch[];
}

let cachedBanks: BankItem[] | null = null;
let isLoadingPromise: Promise<BankItem[]> | null = null;

/**
 * 載入官方金融機構資料庫 (含快取機制)
 */
export async function loadBanks(): Promise<BankItem[]> {
  if (cachedBanks && cachedBanks.length > 0) {
    return cachedBanks;
  }

  // 嘗試自 sessionStorage 讀取
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem('TW_BANKS_CACHE_V1');
      if (stored) {
        cachedBanks = JSON.parse(stored);
        if (cachedBanks && cachedBanks.length > 0) {
          return cachedBanks;
        }
      }
    } catch {
      // 忽略 storage 讀取錯誤
    }
  }

  if (isLoadingPromise) {
    return isLoadingPromise;
  }

  isLoadingPromise = (async () => {
    try {
      const res = await fetch('/data/banks.json');
      if (!res.ok) {
        throw new Error(`無法載入銀行資料 (HTTP ${res.status})`);
      }
      const data: BankItem[] = await res.json();
      cachedBanks = data;

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          sessionStorage.setItem('TW_BANKS_CACHE_V1', JSON.stringify(data));
        } catch {
          // 若超過 quota 則僅保留在記憶體
        }
      }

      return data;
    } finally {
      isLoadingPromise = null;
    }
  })();

  return isLoadingPromise;
}

/**
 * 依銀行代碼尋找銀行
 */
export function findBankByCode(banks: BankItem[], code: string): BankItem | undefined {
  const cleanCode = (code || '').trim().padStart(3, '0');
  return banks.find((b) => b.code === cleanCode || b.code === code.trim());
}

/**
 * 依銀行名稱搜尋銀行 (模糊匹配)
 */
export function searchBanksByName(banks: BankItem[], keyword: string): BankItem[] {
  const q = (keyword || '').trim().toLowerCase();
  if (!q) return banks;
  return banks.filter((b) => b.name.toLowerCase().includes(q) || b.code.includes(q));
}

/**
 * 取得特定銀行的分行清單
 */
export function getBranchesForBank(banks: BankItem[], bankCode: string): BankBranch[] {
  const bank = findBankByCode(banks, bankCode);
  return bank ? bank.branches : [];
}

/**
 * 在特定銀行中依分行代碼尋找分行
 */
export function findBranchByCode(
  branches: BankBranch[],
  branchCode: string
): BankBranch | undefined {
  const q = (branchCode || '').trim();
  if (!q) return undefined;
  return branches.find(
    (br) => br.code === q || br.fullCode === q || br.code.padStart(4, '0') === q.padStart(4, '0')
  );
}

/**
 * 在特定銀行中搜尋分行 (模糊匹配)
 */
export function searchBranchesByName(
  branches: BankBranch[],
  keyword: string
): BankBranch[] {
  const q = (keyword || '').trim().toLowerCase();
  if (!q) return branches;
  return branches.filter(
    (br) => br.name.toLowerCase().includes(q) || br.code.includes(q) || br.fullCode.includes(q)
  );
}
