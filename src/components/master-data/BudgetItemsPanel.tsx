/**
 * src/components/master-data/BudgetItemsPanel.tsx - 預算項目管理面板
 *
 * 核心規範：
 * 1. 全面透過 backendStorageService 呼叫 API，嚴禁直接使用 fetch('/api/backend')。
 * 2. 專案主檔與廠商主檔嚴格依據關聯選擇，確保 projectId/company/projectName 與 vendorId/vendorName 一致性。
 * 3. 預算項目嚴格隸屬於分案 (SubProject)。
 * 4. 金額安全：字串輸入保全，提交時驗證 Number.isFinite，嚴禁使用 parseInt 截斷金額，嚴禁傳送 NaN/Infinity。
 * 5. 嚴格不實作 Delete 功能，遵守現有後端 contract。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { backendStorageService } from '../../services/backendStorage';
import { BackendApiError } from '../../services/backendClient';
import type { BudgetItem, Project, Vendor, SubProject, SaveBudgetItemPayload, FinancialSummary } from '../../models/backend';
import {
  Coins,
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  FolderKanban,
  Building2,
  Calendar,
  FolderTree,
} from 'lucide-react';

/**
 * 格式化數值為千分位字串
 */
function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return '0';
  return Math.round(amount).toLocaleString('zh-TW');
}

export const BudgetItemsPanel: React.FC = () => {
  // 資料狀態
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);

  // 載入狀態
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 篩選與搜尋
  const [searchQuery, setSearchQuery] = useState('');
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedProjectIdFilter, setSelectedProjectIdFilter] = useState<string>('');

  // 訊息提示
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  // Modal 表單狀態
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    projectId: '',
    subProjectId: '',
    subProjectName: '',
    company: '',
    projectName: '',
    itemName: '',
    vendorId: '',
    vendorName: '',
    budgetAmount: '0',
    terminatedAmount: '0',
    status: 'active',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // 1. 載入參照主檔（專案、分案、廠商、財務彙總）與系統現行年度
  const loadReferenceData = useCallback(async () => {
    try {
      const [healthData, projectsData, subProjectsData, vendorsData, summaryData] = await Promise.all([
        backendStorageService.health().catch(() => null),
        backendStorageService.listProjects().catch(() => [] as Project[]),
        backendStorageService.listSubProjects().catch(() => [] as SubProject[]),
        backendStorageService.listVendors().catch(() => [] as Vendor[]),
        backendStorageService.getFinancialSummary().catch(() => null),
      ]);

      if (healthData && healthData.currentYear) {
        const parsedYear = parseInt(healthData.currentYear, 10);
        if (Number.isInteger(parsedYear) && parsedYear > 2000) {
          setCurrentYear(parsedYear);
          setSelectedYear(parsedYear);
        }
      }

      setProjects(projectsData);
      setSubProjects(subProjectsData);
      setVendors(vendorsData);
      setFinancialSummary(summaryData);
    } catch {
      // 容錯處理：不中斷主畫面，後續由 loadBudgetItems 回報錯誤
    }
  }, []);

  // 2. 載入預算項目列表（依年度與專案篩選）
  const loadBudgetItems = useCallback(async (year: number, projectIdFilter?: string) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const payload: { year: number; projectId?: string } = { year };
      if (projectIdFilter && projectIdFilter.trim() !== '') {
        payload.projectId = projectIdFilter.trim();
      }
      const data = await backendStorageService.listBudgetItems(payload);
      setBudgetItems(data);
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setApiError(err.safeMessage);
      } else {
        setApiError('載入預算項目清單時發生錯誤，請稍後再試。');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化載入
  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // 當選擇的篩選年度或專案改變時重新載入預算清單
  useEffect(() => {
    loadBudgetItems(selectedYear, selectedProjectIdFilter);
  }, [loadBudgetItems, selectedYear, selectedProjectIdFilter]);

  // 重新整理全部資料
  const handleRefresh = async () => {
    await loadReferenceData();
    await loadBudgetItems(selectedYear, selectedProjectIdFilter);
  };

  // 開啟新增 Modal
  const handleOpenCreate = () => {
    setEditingItem(null);
    // 預設選取第一個 active 專案（若有的話）
    const firstActiveProject = projects.find((p) => p.status === 'active') || projects[0];

    setFormData({
      year: selectedYear || currentYear,
      projectId: firstActiveProject ? firstActiveProject.projectId : '',
      subProjectId: '',
      subProjectName: '',
      company: firstActiveProject ? firstActiveProject.company : '',
      projectName: firstActiveProject ? firstActiveProject.projectName : '',
      itemName: '',
      vendorId: '',
      vendorName: '',
      budgetAmount: '0',
      terminatedAmount: '0',
      status: 'active',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 開啟編輯 Modal
  const handleOpenEdit = (item: BudgetItem) => {
    setEditingItem(item);
    const itemYear = parseInt(item.year, 10) || selectedYear || currentYear;

    setFormData({
      year: itemYear,
      projectId: item.projectId || '',
      company: item.company || '',
      projectName: item.projectName || '',
      subProjectId: item.subProjectId || '',
      subProjectName: item.subProjectName || '',
      itemName: item.itemName || '',
      vendorId: item.vendorId || '',
      vendorName: item.vendorName || '',
      budgetAmount: String(item.budgetAmount ?? 0),
      terminatedAmount: String(item.terminatedAmount ?? 0),
      status: item.status || 'active',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 關閉 Modal
  const handleCloseModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingItem(null);
    setFormErrors({});
  };

  // 專案選擇變更：嚴格由同一個 Project 物件帶入 projectId, company, projectName
  const handleProjectSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    const selected = projects.find((p) => p.projectId === pId);
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        projectId: selected.projectId,
        company: selected.company,
        projectName: selected.projectName,
        subProjectId: '',
        subProjectName: '',
      }));
      setFormErrors((prev) => {
        const updated = { ...prev };
        delete updated.projectId;
        return updated;
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        projectId: '',
        company: '',
        projectName: '',
        subProjectId: '',
        subProjectName: '',
      }));
    }
  };

  // 廠商選擇變更：嚴格由同一個 Vendor 物件帶入 vendorId, vendorName（或清空）
  const handleVendorSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vId = e.target.value;
    if (!vId) {
      setFormData((prev) => ({
        ...prev,
        vendorId: '',
        vendorName: '',
      }));
    } else {
      const selected = vendors.find((v) => v.vendorId === vId);
      if (selected) {
        setFormData((prev) => ({
          ...prev,
          vendorId: selected.vendorId,
          vendorName: selected.vendorName,
        }));
      }
    }
  };

  // 驗證表單
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 1. 年度驗證
    const y = Number(formData.year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      errors.year = '請輸入合法的西元年份 (2000 ~ 2100)';
    }

    // 2. 專案與分案必填驗證
    if (!formData.projectId || !formData.projectName) {
      errors.projectId = '請選擇所屬專案（若無專案請先至專案主檔建立）';
    }
    if (!editingItem && !formData.subProjectId) {
      errors.subProjectId = '新增預算項目必須選擇分案';
    }
    const selectedSubProject = subProjects.find((item) => item.subProjectId === formData.subProjectId);
    if (selectedSubProject?.status === 'closed') {
      errors.subProjectId = '該分案已結案，不可新增或修改預算項目';
    }

    // 3. 預算項目名稱必填驗證
    if (!formData.itemName.trim()) {
      errors.itemName = '預算項目名稱為必填欄位';
    }

    // 4. 預算金額安全數值驗證
    const cleanBudgetStr = formData.budgetAmount.replace(/,/g, '').trim();
    const budgetNum = cleanBudgetStr === '' ? 0 : Number(cleanBudgetStr);
    if (!Number.isFinite(budgetNum) || budgetNum < 0) {
      errors.budgetAmount = '預算金額必須為大於或等於 0 的有效數值';
    }

    // 5. 終止金額安全數值驗證
    const cleanTermStr = formData.terminatedAmount.replace(/,/g, '').trim();
    const termNum = cleanTermStr === '' ? 0 : Number(cleanTermStr);
    if (!Number.isFinite(termNum) || termNum < 0) {
      errors.terminatedAmount = '終止金額必須為大於或等於 0 的有效數值';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 提交儲存（新增或更新）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    setApiError(null);

    try {
      const budgetNum = Number(formData.budgetAmount.replace(/,/g, '').trim()) || 0;
      const termNum = Number(formData.terminatedAmount.replace(/,/g, '').trim()) || 0;
      const yearNum = Math.floor(Number(formData.year));

      const payload: SaveBudgetItemPayload = {
        budgetItemId: editingItem ? editingItem.budgetItemId : undefined,
        year: yearNum,
        projectId: formData.projectId,
        company: formData.company,
        projectName: formData.projectName,
        subProjectId: formData.subProjectId || undefined,
        subProjectName: formData.subProjectName || undefined,
        itemName: formData.itemName.trim(),
        vendorId: formData.vendorId || undefined,
        vendorName: formData.vendorName || undefined,
        budgetAmount: budgetNum,
        terminatedAmount: termNum,
        status: formData.status || 'active',
      };

      await backendStorageService.saveBudgetItem(payload);

      // 關閉 Modal 並更新列表
      setIsModalOpen(false);
      setEditingItem(null);
      setSuccessMessage(editingItem ? '預算項目已儲存' : '預算項目新增成功');
      setTimeout(() => setSuccessMessage(null), 3000);

      // 重新載入列表與財務資料
      await handleRefresh();
      if (selectedYear !== yearNum) {
        setSelectedYear(yearNum);
      }
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setFormErrors((prev) => ({
          ...prev,
          submit: err.safeMessage,
        }));
      } else {
        setFormErrors((prev) => ({
          ...prev,
          submit: '儲存失敗，請檢查網路連線或稍後再試。',
        }));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 關鍵字搜尋過濾與排序（year DESC, projectName ASC, itemName ASC）
  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = budgetItems.filter((item) => {
      if (!q) return true;
      return (
        item.itemName.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        (item.subProjectName && item.subProjectName.toLowerCase().includes(q)) ||
        (item.vendorName && item.vendorName.toLowerCase().includes(q)) ||
        item.budgetItemId.toLowerCase().includes(q)
      );
    });

    return result.sort((a, b) => {
      const yearA = Number(a.year) || 0;
      const yearB = Number(b.year) || 0;
      if (yearA !== yearB) return yearB - yearA;

      const pComp = a.projectName.localeCompare(b.projectName, 'zh-Hant');
      if (pComp !== 0) return pComp;

      return a.itemName.localeCompare(b.itemName, 'zh-Hant');
    });
  }, [budgetItems, searchQuery]);

  // 可選年度清單（以 currentYear 為中心 +/- 3 年）
  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 3; y--) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  // 分案名稱對照表
  const subProjectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    subProjects.forEach((s) => map.set(s.subProjectId, s.subProjectName));
    return map;
  }, [subProjects]);

  return (
    <div className="space-y-4">
      {/* 頂部操作列：搜尋、年度篩選、專案篩選、重新載入、新增按鈕 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* 搜尋框 */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋預算項目、專案、分案、廠商..."
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

          {/* 專案篩選 */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm max-w-[240px]">
            <FolderKanban className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <label className="text-xs font-semibold text-slate-600 flex-shrink-0">專案：</label>
            <select
              value={selectedProjectIdFilter}
              onChange={(e) => setSelectedProjectIdFilter(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-800 outline-none truncate cursor-pointer"
            >
              <option value="">全部專案</option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 按鈕組 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            title="重新載入"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>新增預算項目</span>
          </button>
        </div>
      </div>

      {/* 提示訊息 */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

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
            <p className="text-sm">載入預算項目資料中...</p>
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium text-slate-600">
              {searchQuery ? '沒有符合搜尋條件的預算項目' : `${selectedYear} 年度尚無預算項目`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery
                ? '請嘗試調整搜尋關鍵字或清除篩選條件。'
                : '可點選右上角「新增預算項目」開始建立預算資料。'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3">預算編號</th>
                    <th className="py-3 px-2">年度</th>
                    <th className="py-3 px-3">專案 / 公司</th>
                    <th className="py-3 px-3">所屬分案</th>
                    <th className="py-3 px-3">項目名稱</th>
                    <th className="py-3 px-3">指定廠商</th>
                    <th className="py-3 px-3 text-right">核定預算</th>
                    <th className="py-3 px-3 text-right">累計請款</th>
                    <th className="py-3 px-3 text-right">終止金額</th>
                    <th className="py-3 px-3 text-right">剩餘預算</th>
                    <th className="py-3 px-2 text-center">狀態</th>
                    <th className="py-3 px-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredAndSortedItems.map((item) => {
                    const bAmount = item.budgetAmount || 0;
                    const tAmount = item.terminatedAmount || 0;
                    const fin = financialSummary?.budgetItems?.[item.budgetItemId];
                    const claimedAmount = fin?.claimedAmount ?? 0;
                    const remainingBudget = fin ? fin.remainingBudget : (bAmount - tAmount);
                    const subName = item.subProjectName || (item.subProjectId ? subProjectNameMap.get(item.subProjectId) : '') || '未指定分案';

                    return (
                      <tr key={item.budgetItemId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono text-xs text-slate-600">
                          {item.budgetItemId}
                        </td>
                        <td className="py-3 px-2 text-slate-700 font-medium">
                          {item.year}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">{item.projectName}</div>
                          <div className="text-xs text-slate-500">{item.company}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 text-slate-800 font-medium">
                            <FolderTree className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{subName}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800">
                          {item.itemName}
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {item.vendorName ? (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>{item.vendorName}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">（未指定）</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-slate-900">
                          {formatCurrency(bAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatCurrency(claimedAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                          {formatCurrency(tAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-blue-700">
                          {formatCurrency(remainingBudget)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              item.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {item.status === 'active' ? '執行中' : '已結案'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>編輯</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAndSortedItems.map((item) => {
                const bAmount = item.budgetAmount || 0;
                const tAmount = item.terminatedAmount || 0;
                const fin = financialSummary?.budgetItems?.[item.budgetItemId];
                const claimedAmount = fin?.claimedAmount ?? 0;
                const remainingBudget = fin ? fin.remainingBudget : (bAmount - tAmount);
                const subName = item.subProjectName || (item.subProjectId ? subProjectNameMap.get(item.subProjectId) : '') || '未指定分案';

                return (
                  <div key={item.budgetItemId} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 text-base">{item.itemName}</div>
                        <div className="text-xs text-slate-600 flex items-center gap-1">
                          <span>{item.projectName}</span>
                          <span>•</span>
                          <span className="text-blue-700 font-medium">{subName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span>{item.company}</span>
                          <span>•</span>
                          <span className="font-mono">{item.year} 年</span>
                        </div>
                      </div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                          item.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {item.status === 'active' ? '執行中' : '已結案'}
                      </span>
                    </div>

                    {/* 廠商與編號資訊 */}
                    <div className="text-xs text-slate-600 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">廠商：</span>
                        <span>{item.vendorName || '（未指定）'}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">{item.budgetItemId}</span>
                    </div>

                    {/* 金額統計卡片 */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400">核定預算</div>
                        <div className="font-mono text-xs font-medium text-slate-900 mt-0.5">
                          NT$ {formatCurrency(bAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">累計請款</div>
                        <div className="font-mono text-xs text-slate-600 mt-0.5">
                          NT$ {formatCurrency(claimedAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-blue-600 font-medium">剩餘預算</div>
                        <div className="font-mono text-xs font-semibold text-blue-700 mt-0.5">
                          NT$ {formatCurrency(remainingBudget)}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>編輯預算項目</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 新增 / 編輯 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[90dvh] flex flex-col animate-scaleUp">
            {/* Modal 標題列 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingItem ? '編輯預算項目' : '新增預算項目'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSaving}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal 表單主體 */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formErrors.submit && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  <span>{formErrors.submit}</span>
                </div>
              )}

              {/* 預算項目編號 (編輯時唯讀顯示) */}
              {editingItem && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    預算項目編號 (唯讀)
                  </label>
                  <input
                    type="text"
                    value={editingItem.budgetItemId}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600 font-mono cursor-not-allowed"
                  />
                </div>
              )}

              {/* 年度 (Year) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  預算年度 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, year: parseInt(e.target.value, 10) || 0 }))
                  }
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  placeholder="例如：2026"
                />
                {formErrors.year && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.year}</p>
                )}
              </div>

              {/* 所屬專案選擇器 */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  所屬專案 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.projectId}
                  onChange={handleProjectSelect}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                >
                  <option value="">-- 請選擇專案 --</option>
                  {projects.filter((p) => editingItem || p.status === 'active').map((p) => {
                    const isInactive = p.status && p.status !== 'active';
                    return (
                      <option key={p.projectId} value={p.projectId}>
                        {p.projectName} ({p.company})
                        {isInactive ? ' [已結案]' : ''}
                      </option>
                    );
                  })}
                </select>
                {formErrors.projectId && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.projectId}</p>
                )}
              </div>

              {/* 關聯公司 (唯讀顯示，由專案決定) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  所屬公司 (由專案自動帶入)
                </label>
                <input
                  type="text"
                  value={formData.company || '（尚未選擇專案）'}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 cursor-not-allowed"
                />
              </div>

              {/* 分案選擇（舊資料可保留未指定） */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  所屬分案 {!editingItem && <span className="text-rose-500">*</span>}
                </label>
                <select
                  value={formData.subProjectId}
                  disabled={!formData.projectId || isSaving}
                  onChange={(e) => {
                    const s = subProjects.find((x) => x.subProjectId === e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      subProjectId: e.target.value,
                      subProjectName: s?.subProjectName || '',
                    }));
                    if (formErrors.subProjectId) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.subProjectId;
                        return next;
                      });
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">{editingItem ? '未指定分案（舊資料）' : '-- 請選擇分案 --'}</option>
                  {subProjects
                    .filter((s) => s.projectId === formData.projectId && (editingItem || s.status === 'active'))
                    .map((s) => (
                      <option key={s.subProjectId} value={s.subProjectId}>
                        {s.subProjectName}
                        {s.status === 'closed' ? ' [已結案]' : ''}
                      </option>
                    ))}
                </select>
                {formErrors.subProjectId && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.subProjectId}</p>
                )}
              </div>

              {/* 預算項目名稱 */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  預算項目名稱 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.itemName}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, itemName: e.target.value }));
                    if (formErrors.itemName) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.itemName;
                        return next;
                      });
                    }
                  }}
                  disabled={isSaving}
                  placeholder="例如：土方工程、機電工程、設計諮詢費"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                />
                {formErrors.itemName && (
                  <p className="text-xs text-rose-600 mt-1">{formErrors.itemName}</p>
                )}
              </div>

              {/* 廠商選擇器 (可選) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  指定廠商 (選填)
                </label>
                <select
                  value={formData.vendorId}
                  onChange={handleVendorSelect}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                >
                  <option value="">-- 未指定廠商 --</option>
                  {vendors.map((v) => (
                    <option key={v.vendorId} value={v.vendorId}>
                      {v.vendorName}
                      {!v.isActive ? ' [已停用]' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  若本項目已確定特定承攬廠商，可於此處指定；亦可保留為未指定。
                </p>
              </div>

              {/* 金額區塊：預算金額與終止金額 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    預算金額 (NT$) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.budgetAmount}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, budgetAmount: e.target.value }))
                    }
                    disabled={isSaving}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  />
                  {formErrors.budgetAmount && (
                    <p className="text-xs text-rose-600 mt-1">{formErrors.budgetAmount}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    終止金額 (NT$)
                  </label>
                  <input
                    type="text"
                    value={formData.terminatedAmount}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, terminatedAmount: e.target.value }))
                    }
                    disabled={isSaving}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  />
                  {formErrors.terminatedAmount && (
                    <p className="text-xs text-rose-600 mt-1">{formErrors.terminatedAmount}</p>
                  )}
                </div>
              </div>

              {/* 狀態 (Status) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">狀態</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                >
                  <option value="active">執行中</option>
                  <option value="closed">已結案</option>
                </select>
              </div>

              {/* Modal 按鈕列 */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>儲存中...</span>
                    </>
                  ) : (
                    <span>儲存</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
