export type FinancialInstitutionType =
  | 'bank'
  | 'foreign_bank'
  | 'credit_coop'
  | 'agricultural_association'
  | 'fishery_association'
  | 'post'
  | 'other';

export interface FinancialInstitutionBranch {
  code: string; // 4 碼 (例如 1440) 或 類別代碼 (例如 0021)
  fullCode: string; // 7 碼 (例如 0071440, 7000021)
  name: string; // 分支名稱 (例如 城東分行, 郵政存簿儲金)
  address?: string;
}

export interface FinancialInstitution {
  code: string; // 3 碼金融機構代碼 (例如 007, 700, 511)
  name: string; // 機構名稱 (例如 第一商業銀行, 中華郵政股份有限公司)
  type: FinancialInstitutionType;
  branches: FinancialInstitutionBranch[];
}

export type BankBranch = FinancialInstitutionBranch;
export type BankItem = FinancialInstitution;

let cachedBanks: FinancialInstitution[] | null = null;
let isLoadingPromise: Promise<FinancialInstitution[]> | null = null;

const CACHE_KEY = 'TW_FINANCIAL_INSTITUTIONS_CACHE_V2';

/**
 * 載入官方金融機構資料庫 (含快取機制)
 */
export async function loadBanks(): Promise<FinancialInstitution[]> {
  if (cachedBanks && cachedBanks.length > 0) {
    return cachedBanks;
  }

  // 嘗試自 sessionStorage 讀取
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem(CACHE_KEY);
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
        throw new Error(`無法載入金融機構資料 (HTTP ${res.status})`);
      }
      const data: FinancialInstitution[] = await res.json();
      cachedBanks = data;

      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
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
