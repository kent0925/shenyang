/**
 * src/utils/formRecordsFilter.ts - 表單紀錄篩選、排序與分頁之純函式 (Pure Functions)
 *
 * 設計原則：
 * 1. 邏輯完全抽離 UI，便於單元測試與跨平台驗證。
 * 2. 嚴禁在此存取 DOM 或 React 狀態。
 * 3. Selector value 針對 Project/SubProject/Vendor 均使用 ID，避免同名衝突。
 */

import type { FormRecord } from '../models/backend';

export type ArchiveStatusFilter = 'all' | 'archived' | 'not_archived';

export type SortOption =
  | 'updatedAt_desc'
  | 'updatedAt_asc'
  | 'formId_desc'
  | 'formId_asc'
  | 'amount_desc'
  | 'amount_asc';

export interface RecordFilterState {
  selectedCompany: string;       // 公司名稱篩選（空字串表示全部）
  selectedProjectId: string;     // 專案編號篩選（空字串表示全部）
  selectedSubProjectId: string;  // 分案編號篩選（空字串表示全部）
  selectedVendorId: string;      // 廠商編號篩選（空字串表示全部）
  selectedArchiveStatus: ArchiveStatusFilter;
  searchQuery: string;
  sortOption: SortOption;
  page: number;
  pageSize: number;
}

export const DEFAULT_FILTER_STATE: RecordFilterState = {
  selectedCompany: '',
  selectedProjectId: '',
  selectedSubProjectId: '',
  selectedVendorId: '',
  selectedArchiveStatus: 'all',
  searchQuery: '',
  sortOption: 'updatedAt_desc',
  page: 1,
  pageSize: 20,
};

/**
 * 判定 FormRecord 是否已正式歸檔 (Excel 與 PDF 檔案 ID 均存在且非空)
 */
export function isFormArchived(record: FormRecord): boolean {
  return Boolean(
    record.excelFileId &&
    String(record.excelFileId).trim() !== '' &&
    record.pdfFileId &&
    String(record.pdfFileId).trim() !== ''
  );
}

/**
 * 從目前已載入的 FormRecord 清單去重取得可用公司清單
 */
export function getAvailableCompanies(records: FormRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    if (r.company && r.company.trim() !== '') {
      set.add(r.company.trim());
    }
  }
  return Array.from(set).sort();
}

export interface ProjectOption {
  projectId: string;
  projectName: string;
  company: string;
}

/**
 * 從目前 FormRecord 取得專案選項（以 projectId 去重，支援依 selectedCompany 篩選）
 */
export function getAvailableProjects(records: FormRecord[], selectedCompany?: string): ProjectOption[] {
  const map = new Map<string, ProjectOption>();
  for (const r of records) {
    if (r.projectId && r.projectId.trim() !== '') {
      const pId = r.projectId.trim();
      const comp = (r.company || '').trim();
      if (!selectedCompany || comp === selectedCompany) {
        if (!map.has(pId)) {
          map.set(pId, {
            projectId: pId,
            projectName: r.projectName || pId,
            company: comp,
          });
        }
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName, 'zh-TW'));
}

export interface SubProjectOption {
  subProjectId: string;
  subProjectName: string;
  projectId: string;
}

/**
 * 從目前 FormRecord 取得分案選項（以 subProjectId 去重，支援依 selectedProjectId 或 selectedCompany 篩選）
 */
export function getAvailableSubProjects(
  records: FormRecord[],
  selectedProjectId?: string,
  selectedCompany?: string
): SubProjectOption[] {
  const map = new Map<string, SubProjectOption>();
  for (const r of records) {
    if (r.subProjectId && r.subProjectId.trim() !== '') {
      const spId = r.subProjectId.trim();
      const pId = (r.projectId || '').trim();
      const comp = (r.company || '').trim();

      if (selectedProjectId && pId !== selectedProjectId) continue;
      if (!selectedProjectId && selectedCompany && comp !== selectedCompany) continue;

      if (!map.has(spId)) {
        map.set(spId, {
          subProjectId: spId,
          subProjectName: r.subProjectName || spId,
          projectId: pId,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.subProjectName.localeCompare(b.subProjectName, 'zh-TW'));
}

export interface VendorOption {
  vendorId: string;
  vendorName: string;
}

/**
 * 從目前 FormRecord 取得受款廠商選項（Vendor 不綁定專案，以 vendorId 去重）
 */
export function getAvailableVendors(records: FormRecord[]): VendorOption[] {
  const map = new Map<string, VendorOption>();
  for (const r of records) {
    if (r.vendorId && r.vendorId.trim() !== '') {
      const vId = r.vendorId.trim();
      if (!map.has(vId)) {
        map.set(vId, {
          vendorId: vId,
          vendorName: r.vendorName || vId,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'zh-TW'));
}

/**
 * 處理級聯篩選狀態清理 (Cascade Clearing)
 * 當上層條件變更時，清除已不相容的下層 filter，且篩選變更時自動重置回第 1 頁
 */
export function resolveCascadeFilter(
  records: FormRecord[],
  currentState: RecordFilterState,
  change: Partial<RecordFilterState>
): RecordFilterState {
  const next = { ...currentState, ...change };

  // 1. 若公司變更，檢查現有 projectId 是否相容
  if ('selectedCompany' in change && change.selectedCompany !== currentState.selectedCompany) {
    if (next.selectedProjectId) {
      const validProjects = getAvailableProjects(records, next.selectedCompany);
      const isStillValid = validProjects.some((p) => p.projectId === next.selectedProjectId);
      if (!isStillValid) {
        next.selectedProjectId = '';
        next.selectedSubProjectId = '';
      }
    }
  }

  // 2. 若專案變更，檢查現有 subProjectId 是否相容
  if ('selectedProjectId' in change && change.selectedProjectId !== currentState.selectedProjectId) {
    if (next.selectedSubProjectId) {
      const validSubProjects = getAvailableSubProjects(records, next.selectedProjectId, next.selectedCompany);
      const isStillValid = validSubProjects.some((sp) => sp.subProjectId === next.selectedSubProjectId);
      if (!isStillValid) {
        next.selectedSubProjectId = '';
      }
    }
  }

  // 3. 任何非分頁的篩選、搜尋或排序條件改變，重置回第 1 頁
  const isPageChangeOnly =
    Object.keys(change).length === 1 && ('page' in change || 'pageSize' in change);
  if (!isPageChangeOnly) {
    next.page = 1;
  }

  return next;
}

/**
 * 依據多重條件篩選表單紀錄
 */
export function filterFormRecords(records: FormRecord[], state: RecordFilterState): FormRecord[] {
  const query = state.searchQuery.trim().toLowerCase();

  return records.filter((r) => {
    // 1. 公司篩選
    if (state.selectedCompany && (r.company || '').trim() !== state.selectedCompany) {
      return false;
    }

    // 2. 主專案篩選 (by projectId)
    if (state.selectedProjectId && (r.projectId || '').trim() !== state.selectedProjectId) {
      return false;
    }

    // 3. 分案篩選 (by subProjectId)
    if (state.selectedSubProjectId && (r.subProjectId || '').trim() !== state.selectedSubProjectId) {
      return false;
    }

    // 4. 受款廠商篩選 (by vendorId)
    if (state.selectedVendorId && (r.vendorId || '').trim() !== state.selectedVendorId) {
      return false;
    }

    // 5. 歸檔狀態篩選
    if (state.selectedArchiveStatus === 'archived') {
      if (!isFormArchived(r)) return false;
    } else if (state.selectedArchiveStatus === 'not_archived') {
      if (isFormArchived(r)) return false;
    }

    // 6. 關鍵字搜尋 (formId, company, projectName, subProjectName, vendorName, vendorTaxId)
    // 嚴格不搜尋 payloadJson
    if (query) {
      const fid = (r.formId || '').toLowerCase();
      const comp = (r.company || '').toLowerCase();
      const proj = (r.projectName || '').toLowerCase();
      const sub = (r.subProjectName || '').toLowerCase();
      const vend = (r.vendorName || '').toLowerCase();
      const tax = (r.vendorTaxId || '').toLowerCase();

      const match =
        fid.includes(query) ||
        comp.includes(query) ||
        proj.includes(query) ||
        sub.includes(query) ||
        vend.includes(query) ||
        tax.includes(query);

      if (!match) return false;
    }

    return true;
  });
}

/**
 * 表單紀錄排序
 */
export function sortFormRecords(records: FormRecord[], sortOption: SortOption): FormRecord[] {
  const list = [...records];

  list.sort((a, b) => {
    switch (sortOption) {
      case 'updatedAt_asc': {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.formId || '').localeCompare(b.formId || '');
      }

      case 'updatedAt_desc': {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return (b.formId || '').localeCompare(a.formId || '');
      }

      case 'formId_asc':
        return (a.formId || '').localeCompare(b.formId || '');

      case 'formId_desc':
        return (b.formId || '').localeCompare(a.formId || '');

      case 'amount_desc': {
        const hasA = a.amount !== undefined && a.amount !== null && Number.isFinite(a.amount);
        const hasB = b.amount !== undefined && b.amount !== null && Number.isFinite(b.amount);
        if (hasA && hasB) {
          if (b.amount! !== a.amount!) return b.amount! - a.amount!;
          return (b.formId || '').localeCompare(a.formId || '');
        }
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return (b.formId || '').localeCompare(a.formId || '');
      }

      case 'amount_asc': {
        const hasA = a.amount !== undefined && a.amount !== null && Number.isFinite(a.amount);
        const hasB = b.amount !== undefined && b.amount !== null && Number.isFinite(b.amount);
        if (hasA && hasB) {
          if (a.amount! !== b.amount!) return a.amount! - b.amount!;
          return (a.formId || '').localeCompare(b.formId || '');
        }
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;
        return (a.formId || '').localeCompare(b.formId || '');
      }

      default:
        return 0;
    }
  });

  return list;
}

export interface PaginationResult {
  paginatedRecords: FormRecord[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

/**
 * 表單紀錄分頁
 */
export function paginateFormRecords(records: FormRecord[], page: number, pageSize: number): PaginationResult {
  const totalCount = records.length;
  const validPageSize = pageSize > 0 ? pageSize : 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / validPageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * validPageSize;
  const paginatedRecords = records.slice(startIndex, startIndex + validPageSize);

  return {
    paginatedRecords,
    totalCount,
    totalPages,
    currentPage,
  };
}
