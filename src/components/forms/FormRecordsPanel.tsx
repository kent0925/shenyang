/**
 * src/components/forms/FormRecordsPanel.tsx - 表單紀錄查詢與開啟面板 (Phase 2C-2)
 *
 * 核心責任：
 * 1. 查詢後端 FormRecord 清單（支援年度、表單類型、公司、專案、分案、廠商、歸檔狀態與關鍵字篩選）。
 * 2. 支援級聯篩選清理 (Cascade Clearing)、多樣化排序與前端分頁。
 * 3. 顯示表單編號、類型、公司、專案、分案、廠商、金額、狀態、版本 (vN)、歸檔狀態與更新時間。
 * 4. 點選「開啟」按鈕透過 getForm 取得完整資料並安全 deserialize 回填。
 * 5. 保留目前版本之 Excel/XLSM、PDF 下載與 PDF 列印功能。
 * 6. 提供「版本」歷史 Modal，透過 listArchivedFormVersions 查詢 Drive 歷次版本並提供舊版本下載與列印。
 * 7. 嚴格不顯示 raw payloadJson，絕不輸出機敏資訊。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { backendStorageService } from '../../services/backendStorage';
import { ArchivedAttachments } from './AttachmentSection';
import { BackendApiError } from '../../services/backendClient';
import type { FormRecord, FormType, ArchivedVersionItem } from '../../models/backend';
import { base64ToBlob, downloadBlob, printBlobPdf } from '../../utils/fileBlob';
import {
  FileText,
  Search,
  FolderOpen,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Calendar,
  Filter,
  Stamp,
  Receipt,
  Building2,
  FileSpreadsheet,
  Printer,
  History,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_FILTER_STATE,
  RecordFilterState,
  isFormArchived,
  getAvailableCompanies,
  getAvailableProjects,
  getAvailableSubProjects,
  getAvailableVendors,
  resolveCascadeFilter,
  filterFormRecords,
  sortFormRecords,
  paginateFormRecords,
} from '../../utils/formRecordsFilter';

interface Props {
  onOpenSealForm: (record: FormRecord) => void;
  onOpenPaymentForm: (record: FormRecord) => void;
}

/**
 * 格式化千分位金額
 */
function formatAmount(amount?: number): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return '—';
  return 'NT$ ' + Math.round(amount).toLocaleString('zh-TW');
}

/**
 * 格式化日期時間顯示
 */
function formatDateTime(dtStr?: string): string {
  if (!dtStr) return '—';
  return dtStr.replace('T', ' ').slice(0, 19);
}

export const FormRecordsPanel: React.FC<Props> = ({
  onOpenSealForm,
  onOpenPaymentForm,
}) => {
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningId, setIsOpeningId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // 伺服器端載入參數（年度、表單類型）
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedType, setSelectedType] = useState<string>('all');

  // 客戶端篩選、排序與分頁狀態
  const [filterState, setFilterState] = useState<RecordFilterState>(DEFAULT_FILTER_STATE);

  // 是否展開進階篩選面板
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // 版本歷史 Modal 狀態
  const [versionModalRecord, setVersionModalRecord] = useState<FormRecord | null>(null);
  const [versionItems, setVersionItems] = useState<ArchivedVersionItem[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionModalError, setVersionModalError] = useState<string | null>(null);

  // 訊息
  const [apiError, setApiError] = useState<string | null>(null);

  // 載入表單列表
  const loadForms = useCallback(async (year: number, formTypeFilter: string) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const payload: { year: number; formType?: FormType } = { year };
      if (formTypeFilter && formTypeFilter !== 'all') {
        payload.formType = formTypeFilter as FormType;
      }
      const list = await backendStorageService.listForms(payload);
      setForms(list);
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setApiError(err.safeMessage);
      } else {
        setApiError('載入表單紀錄清單失敗，請稍後再試。');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 當年度或表單類型切換時重新載入後端資料
  useEffect(() => {
    loadForms(selectedYear, selectedType);
  }, [loadForms, selectedYear, selectedType]);

  // 篩選變更處理（自動處理級聯清理與分頁重置）
  const handleFilterUpdate = (change: Partial<RecordFilterState>) => {
    setFilterState((prev) => resolveCascadeFilter(forms, prev, change));
  };

  // 可選下拉選項計算（去重生成）
  const availableCompanies = useMemo(() => getAvailableCompanies(forms), [forms]);
  const availableProjects = useMemo(
    () => getAvailableProjects(forms, filterState.selectedCompany),
    [forms, filterState.selectedCompany]
  );
  const availableSubProjects = useMemo(
    () => getAvailableSubProjects(forms, filterState.selectedProjectId, filterState.selectedCompany),
    [forms, filterState.selectedProjectId, filterState.selectedCompany]
  );
  const availableVendors = useMemo(() => getAvailableVendors(forms), [forms]);

  // 篩選、排序與分頁流水線
  const filteredList = useMemo(() => filterFormRecords(forms, filterState), [forms, filterState]);
  const sortedList = useMemo(() => sortFormRecords(filteredList, filterState.sortOption), [filteredList, filterState.sortOption]);
  const { paginatedRecords, totalCount, totalPages, currentPage } = useMemo(
    () => paginateFormRecords(sortedList, filterState.page, filterState.pageSize),
    [sortedList, filterState.page, filterState.pageSize]
  );

  // 檢查是否有已設定的進階篩選條件
  const hasActiveAdvancedFilters = Boolean(
    filterState.selectedCompany ||
    filterState.selectedProjectId ||
    filterState.selectedSubProjectId ||
    filterState.selectedVendorId ||
    filterState.selectedArchiveStatus !== 'all'
  );

  // 開啟表單
  const handleOpenRecord = async (record: FormRecord) => {
    if (isOpeningId) return;
    setIsOpeningId(record.formId);
    setApiError(null);

    try {
      const fullRecord = await backendStorageService.getForm({
        formId: record.formId,
        year: selectedYear,
      });

      if (fullRecord.formType === 'seal_approval') {
        onOpenSealForm(fullRecord);
      } else if (fullRecord.formType === 'payment_request') {
        onOpenPaymentForm(fullRecord);
      } else {
        throw new Error(`未知的表單類型: ${fullRecord.formType}`);
      }
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setApiError(err.safeMessage);
      } else {
        setApiError(`開啟表單失敗：${err.message || '資料格式錯誤'}`);
      }
    } finally {
      setIsOpeningId(null);
    }
  };

  // 下載目前權威版本之 Excel/XLSM 或 PDF 檔案
  const handleDownloadArchivedFile = async (
    record: FormRecord,
    fileType: 'excel' | 'pdf',
    version?: number
  ) => {
    const key = version ? `${record.formId}_v${version}_${fileType}` : `${record.formId}_${fileType}`;
    if (downloadingKey) return;
    setDownloadingKey(key);
    setApiError(null);

    try {
      const res = await backendStorageService.getArchivedFormFile({
        formId: record.formId,
        fileType,
        year: selectedYear,
        version,
      });
      const blob = base64ToBlob(res.base64, res.mimeType);
      downloadBlob(blob, res.fileName);
    } catch (err: any) {
      const msg = err instanceof BackendApiError ? err.safeMessage : (err.message || '下載歸檔檔案失敗');
      const errTarget = versionModalRecord ? setVersionModalError : setApiError;
      errTarget(`下載檔案失敗：${msg}`);
    } finally {
      setDownloadingKey(null);
    }
  };

  // 列印目前或指定版本之 PDF 檔案
  const handlePrintArchivedPdf = async (record: FormRecord, version?: number) => {
    const key = version ? `${record.formId}_v${version}_print` : `${record.formId}_print`;
    if (downloadingKey) return;
    setDownloadingKey(key);
    setApiError(null);

    try {
      const res = await backendStorageService.getArchivedFormFile({
        formId: record.formId,
        fileType: 'pdf',
        year: selectedYear,
        version,
      });
      const blob = base64ToBlob(res.base64, res.mimeType || 'application/pdf');
      printBlobPdf(blob);
    } catch (err: any) {
      const msg = err instanceof BackendApiError ? err.safeMessage : (err.message || '列印失敗');
      const errTarget = versionModalRecord ? setVersionModalError : setApiError;
      errTarget(`列印檔案失敗：${msg}`);
    } finally {
      setDownloadingKey(null);
    }
  };

  // 開啟歷史版本 Modal
  const handleOpenVersionModal = async (record: FormRecord) => {
    setVersionModalRecord(record);
    setVersionItems([]);
    setIsLoadingVersions(true);
    setVersionModalError(null);

    try {
      const versions = await backendStorageService.listArchivedFormVersions({
        formId: record.formId,
        year: selectedYear,
      });
      setVersionItems(versions);
    } catch (err: any) {
      const msg = err instanceof BackendApiError ? err.safeMessage : (err.message || '查詢版本歷史失敗');
      setVersionModalError(`無法載入版本歷史：${msg}`);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // 關閉版本歷史 Modal
  const handleCloseVersionModal = () => {
    setVersionModalRecord(null);
    setVersionItems([]);
    setVersionModalError(null);
  };

  // 可選年度清單
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current + 1; y >= current - 3; y--) {
      list.push(y);
    }
    return list;
  }, []);

  return (
    <div className="space-y-4">
      {/* 頂部操作列：搜尋、年度、類型、排序、進階篩選切換、重新整理 */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
          {/* 關鍵字搜尋框 */}
          <div className="relative w-full sm:w-auto sm:min-w-[240px] sm:max-w-xs flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterState.searchQuery}
              onChange={(e) => handleFilterUpdate({ searchQuery: e.target.value })}
              placeholder="搜尋編號、公司、專案、分案、廠商..."
              className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {filterState.searchQuery && (
              <button
                type="button"
                onClick={() => handleFilterUpdate({ searchQuery: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="清除搜尋"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* 年度選擇 */}
            <div className="flex-1 sm:flex-initial flex items-center justify-between sm:justify-start gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <label className="text-xs font-semibold text-slate-600">年度：</label>
              </div>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-sm font-medium text-slate-800 outline-none cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y} 年
                  </option>
                ))}
              </select>
            </div>

            {/* 表單類型切換 */}
            <div className="flex-1 sm:flex-initial flex items-center justify-between sm:justify-start gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
              <div className="flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <label className="text-xs font-semibold text-slate-600">類型：</label>
              </div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">全部類型</option>
                <option value="seal_approval">用印／簽呈</option>
                <option value="payment_request">請款單</option>
              </select>
            </div>

            {/* 排序選單 */}
            <div className="flex-1 sm:flex-initial flex items-center justify-between sm:justify-start gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <label className="text-xs font-semibold text-slate-600">排序：</label>
              </div>
              <select
                value={filterState.sortOption}
                onChange={(e) => handleFilterUpdate({ sortOption: e.target.value as any })}
                className="bg-transparent text-sm font-medium text-slate-800 outline-none cursor-pointer"
              >
                <option value="updatedAt_desc">最新異動</option>
                <option value="updatedAt_asc">最舊異動</option>
                <option value="formId_desc">表單編號新→舊</option>
                <option value="formId_asc">表單編號舊→新</option>
                <option value="amount_desc">請款金額高→低</option>
                <option value="amount_asc">請款金額低→高</option>
              </select>
            </div>

            {/* 進階篩選切換按鈕 */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`p-2 border rounded-lg transition flex items-center gap-1.5 text-sm flex-shrink-0 ${
                hasActiveAdvancedFilters || showAdvancedFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              title="進階篩選條件"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">
                進階篩選
                {hasActiveAdvancedFilters && (
                  <span className="ml-1 w-2 h-2 inline-block rounded-full bg-blue-600" />
                )}
              </span>
            </button>

            {/* 重新載入按鈕 */}
            <button
              type="button"
              onClick={() => loadForms(selectedYear, selectedType)}
              disabled={isLoading}
              className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 flex-shrink-0"
              title="重新整理"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 進階篩選下拉區塊（公司、專案、分案、廠商、歸檔狀態） */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            {/* 公司篩選 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">公司：</label>
              <select
                value={filterState.selectedCompany}
                onChange={(e) => handleFilterUpdate({ selectedCompany: e.target.value })}
                className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">全部公司</option>
                {availableCompanies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 專案篩選 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">主專案：</label>
              <select
                value={filterState.selectedProjectId}
                onChange={(e) => handleFilterUpdate({ selectedProjectId: e.target.value })}
                className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">全部專案</option>
                {availableProjects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName}
                  </option>
                ))}
              </select>
            </div>

            {/* 分案篩選 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">分案：</label>
              <select
                value={filterState.selectedSubProjectId}
                onChange={(e) => handleFilterUpdate({ selectedSubProjectId: e.target.value })}
                className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">全部分案</option>
                {availableSubProjects.map((sp) => (
                  <option key={sp.subProjectId} value={sp.subProjectId}>
                    {sp.subProjectName}
                  </option>
                ))}
              </select>
            </div>

            {/* 受款廠商篩選 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">受款廠商：</label>
              <select
                value={filterState.selectedVendorId}
                onChange={(e) => handleFilterUpdate({ selectedVendorId: e.target.value })}
                className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">全部廠商</option>
                {availableVendors.map((v) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorName}
                  </option>
                ))}
              </select>
            </div>

            {/* 歸檔狀態篩選 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">歸檔狀態：</label>
              <select
                value={filterState.selectedArchiveStatus}
                onChange={(e) => handleFilterUpdate({ selectedArchiveStatus: e.target.value as any })}
                className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">全部歸檔狀態</option>
                <option value="archived">已歸檔 (Excel+PDF)</option>
                <option value="not_archived">尚未正式產檔</option>
              </select>
            </div>

            {/* 清除進階篩選 */}
            {hasActiveAdvancedFilters && (
              <div className="sm:col-span-2 md:col-span-5 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    handleFilterUpdate({
                      selectedCompany: '',
                      selectedProjectId: '',
                      selectedSubProjectId: '',
                      selectedVendorId: '',
                      selectedArchiveStatus: 'all',
                    })
                  }
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>清除進階篩選條件</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 錯誤警示 */}
      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{apiError}</span>
        </div>
      )}

      {/* 列表容器 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" />
            <p className="text-sm font-medium">載入中...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium text-slate-600">
              {filterState.searchQuery || hasActiveAdvancedFilters
                ? '沒有符合搜尋或篩選條件的表單紀錄'
                : `${selectedYear} 年度尚無表單紀錄`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {filterState.searchQuery || hasActiveAdvancedFilters
                ? '請嘗試調整篩選條件或搜尋關鍵字。'
                : '至「用印／簽呈」或「請款單」填寫並儲存後，紀錄將列於此處。'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3">表單編號</th>
                    <th className="py-3 px-3">類型</th>
                    <th className="py-3 px-3">公司</th>
                    <th className="py-3 px-3">專案／分案</th>
                    <th className="py-3 px-3">受款廠商</th>
                    <th className="py-3 px-3 text-right">請款金額</th>
                    <th className="py-3 px-2 text-center">版本</th>
                    <th className="py-3 px-2 text-center">歸檔狀態</th>
                    <th className="py-3 px-3">更新時間</th>
                    <th className="py-3 px-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedRecords.map((record) => {
                    const isSeal = record.formType === 'seal_approval';
                    const isOpening = isOpeningId === record.formId;
                    const archived = isFormArchived(record);
                    const currentVersion = record.version || 1;

                    return (
                      <tr key={record.formId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono text-xs font-medium text-blue-700 whitespace-nowrap">
                          {record.formId}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                              isSeal
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {isSeal ? <Stamp className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                            <span>{isSeal ? '用印／簽呈' : '請款單'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-800 font-medium">
                          {record.company || '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          <div className="font-medium text-slate-800">{record.projectName || '—'}</div>
                          {record.subProjectName && (
                            <div className="text-xs text-slate-500">{record.subProjectName}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {record.vendorName ? (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>{record.vendorName}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                          {isSeal ? '—' : formatAmount(record.amount)}
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <span className="inline-block px-1.5 py-0.5 rounded font-mono text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            v{currentVersion}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          {archived ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>已歸檔</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>尚未正式產檔</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                          {formatDateTime(record.updatedAt || record.createdAt)}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenRecord(record)}
                              disabled={Boolean(isOpeningId)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-md transition disabled:opacity-50"
                              title="開啟編輯表單"
                            >
                              {isOpening ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FolderOpen className="w-3.5 h-3.5" />
                              )}
                              <span>開啟</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenVersionModal(record)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md transition"
                              title="檢視歷史歸檔版本"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>版本</span>
                            </button>

                            {record.excelFileId ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadArchivedFile(record, 'excel')}
                                disabled={Boolean(downloadingKey)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-md transition disabled:opacity-50"
                                title={`下載目前版本 ${isSeal ? 'XLSM' : 'Excel'}`}
                              >
                                {downloadingKey === `${record.formId}_excel` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                )}
                                <span>{isSeal ? 'XLSM' : 'Excel'}</span>
                              </button>
                            ) : null}

                            {record.pdfFileId ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadArchivedFile(record, 'pdf')}
                                  disabled={Boolean(downloadingKey)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 rounded-md transition disabled:opacity-50"
                                  title="下載目前版本 PDF"
                                >
                                  {downloadingKey === `${record.formId}_pdf` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <FileText className="w-3.5 h-3.5" />
                                  )}
                                  <span>PDF</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePrintArchivedPdf(record)}
                                  disabled={Boolean(downloadingKey)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-md transition disabled:opacity-50"
                                  title="列印目前版本 PDF"
                                >
                                  {downloadingKey === `${record.formId}_print` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Printer className="w-3.5 h-3.5" />
                                  )}
                                  <span>列印</span>
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedRecords.map((record) => {
                const isSeal = record.formType === 'seal_approval';
                const isOpening = isOpeningId === record.formId;
                const archived = isFormArchived(record);
                const currentVersion = record.version || 1;

                return (
                  <div key={record.formId} className="p-4 space-y-2.5 hover:bg-slate-50/60 transition">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {record.formId}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                            isSeal
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isSeal ? <Stamp className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                          <span>{isSeal ? '用印／簽呈' : '請款單'}</span>
                        </span>
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                          v{currentVersion}
                        </span>
                      </div>
                      {archived ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          已歸檔
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          尚未正式產檔
                        </span>
                      )}
                    </div>

                    <div className="text-sm space-y-1 text-slate-700">
                      <div className="font-semibold text-slate-900">{record.company || '—'}</div>
                      {record.projectName && (
                        <div className="text-xs text-slate-600 flex items-center gap-1">
                          <span className="text-slate-400">專案：</span>
                          <span>{record.projectName}</span>
                        </div>
                      )}
                      {record.subProjectName && (
                        <div className="text-xs text-slate-600 flex items-center gap-1">
                          <span className="text-slate-400">分案：</span>
                          <span>{record.subProjectName}</span>
                        </div>
                      )}
                      {record.vendorName && (
                        <div className="text-xs text-slate-600 flex items-center gap-1">
                          <span className="text-slate-400">廠商：</span>
                          <span>{record.vendorName}</span>
                        </div>
                      )}
                      {!isSeal && record.amount !== undefined && (
                        <div className="text-sm font-semibold text-blue-700 pt-0.5">
                          請款金額：{formatAmount(record.amount)}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 font-mono pt-1">
                        更新：{formatDateTime(record.updatedAt || record.createdAt)}
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenRecord(record)}
                          disabled={Boolean(isOpeningId)}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-semibold text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 rounded-xl transition min-h-[38px] disabled:opacity-50"
                        >
                          {isOpening ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>載入中...</span>
                            </>
                          ) : (
                            <>
                              <FolderOpen className="w-4 h-4" />
                              <span>開啟此表單</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenVersionModal(record)}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-semibold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200 rounded-xl transition min-h-[38px]"
                        >
                          <History className="w-4 h-4" />
                          <span>歷史版本</span>
                        </button>
                      </div>

                      {(record.excelFileId || record.pdfFileId) ? (
                        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                          {record.excelFileId ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadArchivedFile(record, 'excel')}
                              disabled={Boolean(downloadingKey)}
                              className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg transition disabled:opacity-50"
                            >
                              {downloadingKey === `${record.formId}_excel` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                              )}
                              <span>{isSeal ? 'XLSM' : 'Excel'}</span>
                            </button>
                          ) : (
                            <div />
                          )}

                          {record.pdfFileId ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDownloadArchivedFile(record, 'pdf')}
                                disabled={Boolean(downloadingKey)}
                                className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg transition disabled:opacity-50"
                              >
                                {downloadingKey === `${record.formId}_pdf` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5" />
                                )}
                                <span>PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintArchivedPdf(record)}
                                disabled={Boolean(downloadingKey)}
                                className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg transition disabled:opacity-50"
                              >
                                {downloadingKey === `${record.formId}_print` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Printer className="w-3.5 h-3.5" />
                                )}
                                <span>列印</span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 分頁控制條 */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  共 <strong className="text-slate-900 font-bold">{totalCount}</strong> 筆
                </span>
                <span>
                  第 <strong className="text-slate-900 font-bold">{currentPage}</strong> / {totalPages} 頁
                </span>
                <div className="flex items-center gap-1">
                  <label className="text-slate-500">每頁：</label>
                  <select
                    value={filterState.pageSize}
                    onChange={(e) => handleFilterUpdate({ pageSize: Number(e.target.value) })}
                    className="py-1 px-2 border border-slate-300 rounded bg-white font-medium text-slate-800 outline-none"
                  >
                    <option value={20}>20 筆</option>
                    <option value={50}>50 筆</option>
                    <option value={100}>100 筆</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleFilterUpdate({ page: Math.max(1, currentPage - 1) })}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一頁</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFilterUpdate({ page: Math.min(totalPages, currentPage + 1) })}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 font-medium"
                >
                  <span>下一頁</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 歷史版本 Modal */}
      {versionModalRecord && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    表單歷史歸檔版本 — {versionModalRecord.formId}
                  </h3>
                  <p className="text-xs text-slate-500">
                    目前系統版本：v{versionModalRecord.version || 1}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseVersionModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {versionModalError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  <span>{versionModalError}</span>
                </div>
              )}

              {isLoadingVersions ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-indigo-600 mb-2" />
                  <p className="text-xs font-medium">讀取 Drive 歸檔歷史中...</p>
                </div>
              ) : versionItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium text-slate-600">此表單尚無正式歸檔版本</p>
                  <p className="text-xs text-slate-400 mt-1">
                    完成產檔並歸檔至 Google Drive 後，各歷次版本將顯示於此處。
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {versionItems.map((ver) => {
                    const isSeal = versionModalRecord.formType === 'seal_approval';

                    return (
                      <div
                        key={ver.version}
                        className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          ver.isCurrent
                            ? 'bg-indigo-50/40 border-indigo-200'
                            : 'bg-white border-slate-200 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-slate-900">
                              v{ver.version}
                            </span>
                            {ver.isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                目前版本
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            封存時間：{ver.archivedAt || '—'}
                          </div>
                          <details className="text-sm pt-2">
                            <summary className="cursor-pointer text-blue-700">附件（v{ver.version}）</summary>
                            <ArchivedAttachments formId={versionModalRecord.formId} version={ver.version} />
                          </details>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ver.excelAvailable ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadArchivedFile(versionModalRecord, 'excel', ver.version)
                              }
                              disabled={Boolean(downloadingKey)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 rounded-lg transition disabled:opacity-50"
                              title={`下載 v${ver.version} ${isSeal ? 'XLSM' : 'Excel'}`}
                            >
                              {downloadingKey === `${versionModalRecord.formId}_v${ver.version}_excel` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                              )}
                              <span>{isSeal ? 'XLSM' : 'Excel'}</span>
                            </button>
                          ) : null}

                          {ver.pdfAvailable ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadArchivedFile(versionModalRecord, 'pdf', ver.version)
                                }
                                disabled={Boolean(downloadingKey)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100/70 border border-red-200 rounded-lg transition disabled:opacity-50"
                                title={`下載 v${ver.version} PDF`}
                              >
                                {downloadingKey === `${versionModalRecord.formId}_v${ver.version}_pdf` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5" />
                                )}
                                <span>PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handlePrintArchivedPdf(versionModalRecord, ver.version)
                                }
                                disabled={Boolean(downloadingKey)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/70 border border-slate-300 rounded-lg transition disabled:opacity-50"
                                title={`列印 v${ver.version} PDF`}
                              >
                                {downloadingKey === `${versionModalRecord.formId}_v${ver.version}_print` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Printer className="w-3.5 h-3.5" />
                                )}
                                <span>列印</span>
                              </button>
                            </>
                          ) : null}

                          {!ver.excelAvailable && !ver.pdfAvailable && (
                            <span className="text-xs text-slate-400 italic">檔案不可用</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={handleCloseVersionModal}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
