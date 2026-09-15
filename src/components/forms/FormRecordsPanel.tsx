/**
 * src/components/forms/FormRecordsPanel.tsx - 表單紀錄查詢與開啟面板
 *
 * 核心責任：
 * 1. 查詢後端 FormRecord 清單（支援年度、表單類型與關鍵字篩選）。
 * 2. 顯示表單編號、類型、公司、專案、廠商、金額、狀態與更新時間。
 * 3. 點選「開啟」按鈕透過 getForm 取得完整資料並安全 deserialize 回填。
 * 4. 嚴格不顯示 raw payloadJson，絕不輸出機敏資訊。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { backendStorageService } from '../../services/backendStorage';
import { BackendApiError } from '../../services/backendClient';
import type { FormRecord, FormType } from '../../models/backend';
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
} from 'lucide-react';

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

  // 篩選狀態
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // 當年度或表單類型切換時重新載入
  useEffect(() => {
    loadForms(selectedYear, selectedType);
  }, [loadForms, selectedYear, selectedType]);

  // 開啟表單
  const handleOpenRecord = async (record: FormRecord) => {
    if (isOpeningId) return;
    setIsOpeningId(record.formId);
    setApiError(null);

    try {
      // 呼叫 getForm 取得最完整且最新的 FormRecord（保證含有完整 payloadJson）
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

  // 關鍵字搜尋過濾
  const filteredForms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return forms;

    return forms.filter((f) => {
      const fid = (f.formId || '').toLowerCase();
      const comp = (f.company || '').toLowerCase();
      const proj = (f.projectName || '').toLowerCase();
      const vend = (f.vendorName || '').toLowerCase();
      const tax = (f.vendorTaxId || '').toLowerCase();
      return (
        fid.includes(q) ||
        comp.includes(q) ||
        proj.includes(q) ||
        vend.includes(q) ||
        tax.includes(q)
      );
    });
  }, [forms, searchQuery]);

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
      {/* 頂部操作列：搜尋、年度、類型篩選、重新整理 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* 搜尋框 */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋表單編號、公司、專案、廠商..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 年度選擇 */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" />
            <label className="text-xs font-semibold text-slate-600">年度：</label>
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
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <label className="text-xs font-semibold text-slate-600">類型：</label>
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
        </div>

        {/* 重新載入按鈕 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadForms(selectedYear, selectedType)}
            disabled={isLoading}
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            title="重新載入"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 錯誤警示 */}
      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{apiError}</span>
        </div>
      )}

      {/* 列表表格 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" />
            <p className="text-sm">載入表單紀錄中...</p>
          </div>
        ) : filteredForms.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium text-slate-600">
              {searchQuery ? '沒有符合搜尋條件的表單紀錄' : `${selectedYear} 年度尚無表單紀錄`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery
                ? '請嘗試調整搜尋關鍵字或清除篩選條件。'
                : '至「用印／簽呈」或「請款單」填寫並儲存後，紀錄將列於此處。'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">表單編號</th>
                  <th className="py-3 px-4">表單類型</th>
                  <th className="py-3 px-4">公司名稱</th>
                  <th className="py-3 px-4">專案名稱</th>
                  <th className="py-3 px-4">受款廠商</th>
                  <th className="py-3 px-4 text-right">請款金額</th>
                  <th className="py-3 px-4 text-center">狀態</th>
                  <th className="py-3 px-4">更新時間</th>
                  <th className="py-3 px-4 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredForms.map((record) => {
                  const isSeal = record.formType === 'seal_approval';
                  const isOpening = isOpeningId === record.formId;

                  return (
                    <tr key={record.formId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-medium text-blue-700">
                        {record.formId}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
                            isSeal
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isSeal ? <Stamp className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                          <span>{isSeal ? '用印／簽呈' : '請款單'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium">
                        {record.company || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {record.projectName || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {record.vendorName ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{record.vendorName}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                        {isSeal ? '—' : formatAmount(record.amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {record.status === 'submitted' ? '已儲存' : record.status || '草稿'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 font-mono">
                        {formatDateTime(record.updatedAt || record.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenRecord(record)}
                          disabled={Boolean(isOpeningId)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-md transition disabled:opacity-50"
                        >
                          {isOpening ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>載入中...</span>
                            </>
                          ) : (
                            <>
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>開啟</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
