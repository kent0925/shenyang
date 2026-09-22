/**
 * src/components/master-data/ProjectsPanel.tsx - 專案主檔管理面板
 *
 * 核心規範：
 * 1. 全面透過 backendStorageService 呼叫 API，嚴禁直接使用 fetch('/api/backend')。
 * 2. 支援專案清單讀取、新增專案、編輯既有專案（projectId 唯讀）。
 * 3. 完整處理 loading、saving、error 與防重複提交 (isSaving disabled)。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { backendStorageService } from '../../services/backendStorage';
import { BackendApiError } from '../../services/backendClient';
import type { FinancialSummary, Project, SubProject } from '../../models/backend';
import { formatCurrency } from '../../utils/format';
import {
  FolderKanban,
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
} from 'lucide-react';

const COMMON_COMPANIES = [
  '昇陽開發實業股份有限公司',
  '東勛工程有限公司',
  '信友營造股份有限公司',
];

export const ProjectsPanel: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 編輯 / 新增 Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    company: COMMON_COMPANIES[0],
    projectName: '',
    status: 'active',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // 載入專案列表
  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const [data, summary, subList] = await Promise.all([backendStorageService.listProjects(), backendStorageService.getFinancialSummary().catch(() => null), backendStorageService.listSubProjects().catch(() => [] as SubProject[])]);
      setProjects(data);
      setFinancialSummary(summary);
      setSubProjects(subList);
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setApiError(err.safeMessage);
      } else {
        setApiError('載入專案清單時發生錯誤，請稍後再試。');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 開啟新增 Modal
  const handleOpenCreate = () => {
    setEditingProject(null);
    setFormData({
      company: COMMON_COMPANIES[0],
      projectName: '',
      status: 'active',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 開啟編輯 Modal
  const handleOpenEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      company: project.company,
      projectName: project.projectName,
      status: project.status || 'active',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 關閉 Modal
  const handleCloseModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingProject(null);
    setFormErrors({});
  };

  // 驗證表單
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.company.trim()) {
      errors.company = '請輸入或選擇公司名稱';
    }
    if (!formData.projectName.trim()) {
      errors.projectName = '請填寫專案名稱';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 儲存專案 (新增或更新)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !validateForm()) return;

    if (editingProject && formData.status === 'closed') {
      const activeNames = subProjects.filter((item) => item.projectId === editingProject.projectId && item.status === 'active').map((item) => item.subProjectName);
      if (activeNames.length) {
        setFormErrors({ submit: `無法結案，目前仍有 ${activeNames.length} 個進行中的分案：${activeNames.join('、')}` });
        return;
      }
    }

    setIsSaving(true);
    setApiError(null);

    try {
      const payload = {
        projectId: editingProject ? editingProject.projectId : undefined,
        company: formData.company.trim(),
        projectName: formData.projectName.trim(),
        status: formData.status,
      };

      const saved = await backendStorageService.saveProject(payload);

      // 更新列表資料
      if (editingProject) {
        setProjects((prev) =>
          prev.map((p) => (p.projectId === saved.projectId ? saved : p))
        );
        showSuccessNotification('專案資料已成功更新！');
      } else {
        setProjects((prev) => [saved, ...prev]);
        showSuccessNotification('新專案已成功建立！');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setFormErrors({ submit: err.safeMessage });
      } else {
        setFormErrors({ submit: '儲存專案時發生未預期錯誤，請稍後再試。' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 提示訊息計時清理
  const showSuccessNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  // 依條件搜尋與排序 (active 優先，再依名稱排序)
  const filteredProjects = useMemo(() => {
    let list = [...projects];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.projectId.toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q) ||
          p.company.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const aActive = a.status === 'active' ? 1 : 0;
      const bActive = b.status === 'active' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return a.projectName.localeCompare(b.projectName, 'zh-TW');
    });

    return list;
  }, [projects, searchQuery]);

  return (
    <div className="space-y-4">
      {/* 頂部操作與搜尋列 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋專案名稱、編號或公司..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadProjects}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg text-sm transition disabled:opacity-50"
            title="重新整理"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">重新整理</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>新增專案</span>
          </button>
        </div>
      </div>

      {/* 成功提示 */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 全域錯誤提示 */}
      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* 專案列表表格 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm">載入專案資料中...</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <FolderKanban className="w-8 h-8 text-slate-300" />
            <span className="text-sm">
              {searchQuery ? '找不到符合條件的專案' : '目前尚無專案資料，請點選上方「新增專案」'}
            </span>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-semibold">
                  <tr>
                    <th className="py-3 px-4">專案編號</th>
                    <th className="py-3 px-4">所屬公司</th>
                    <th className="py-3 px-4">專案名稱</th>
                    <th className="py-3 px-4 text-right">分案彙總預算</th>
                    <th className="py-3 px-4 text-right">已請款</th>
                    <th className="py-3 px-4 text-right">剩餘</th>
                    <th className="py-3 px-4">狀態</th>
                    <th className="py-3 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((project) => (
                    <tr key={project.projectId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {project.projectId}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {project.company}
                      </td>
                      <td className="py-3 px-4 text-slate-900 font-semibold">
                        {project.projectName}
                      </td>
                      {(() => { const total = financialSummary?.projects[project.projectId]; return <><td className="py-3 px-4 text-right font-mono text-xs">{total ? formatCurrency(total.totalBudget) : '—'}</td><td className="py-3 px-4 text-right font-mono text-xs">{total ? formatCurrency(total.claimedAmount) : '—'}</td><td className="py-3 px-4 text-right font-mono text-xs">{total ? formatCurrency(total.remainingBudget) : '—'}</td></>; })()}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            project.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {project.status === 'active' ? '進行中' : '已結案'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(project)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>編輯</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredProjects.map((project) => (
                <div key={project.projectId} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900 text-sm">{project.projectName}</div>
                      <div className="text-xs text-slate-600">{project.company}</div>
                      <div className="text-[11px] font-mono text-slate-400">{project.projectId}</div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                        project.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {project.status === 'active' ? '進行中' : '已結案'}
                    </span>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(project)}
                      className="w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>編輯專案</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 新增 / 編輯專案 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-blue-700" />
                <h3 className="font-bold text-slate-900">
                  {editingProject ? '編輯專案' : '新增專案'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSaving}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              {editingProject && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    專案編號 (唯讀)
                  </label>
                  <input
                    type="text"
                    value={editingProject.projectId}
                    disabled
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-500 cursor-not-allowed"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  公司名稱 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5">
                  <select
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  >
                    {COMMON_COMPANIES.map((comp) => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                    <option value="">自行手動輸入...</option>
                  </select>
                  {!COMMON_COMPANIES.includes(formData.company) && (
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="請輸入公司名稱"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  )}
                </div>
                {formErrors.company && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.company}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  專案名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="請輸入專案名稱"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
                {formErrors.projectName && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.projectName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  專案狀態
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                >
                  <option value="active">進行中</option>
                  <option value="closed">已結案</option>
                </select>
              </div>

              {formErrors.submit && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formErrors.submit}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>儲存中...</span>
                    </>
                  ) : (
                    <span>儲存專案</span>
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
