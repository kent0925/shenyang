/**
 * src/components/master-data/VendorsPanel.tsx - 廠商主檔管理面板
 *
 * 核心規範：
 * 1. 全面透過 backendStorageService 呼叫 API，嚴禁直接使用 fetch('/api/backend')。
 * 2. 帳號、統編、金融機構代碼、分支機構代碼必須保持 string 型別，嚴禁 Number() / parseInt()。
 * 3. 列表帳號實施部分遮蔽 (如 ••••••1234)，防範機敏金融資訊大範圍暴露。
 * 4. 嚴禁在 console.log 中輸出完整廠商或銀行帳號。
 * 5. 整合既有 bankLookup.ts 輔助銀行與分行選擇。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { backendStorageService } from '../../services/backendStorage';
import { BackendApiError } from '../../services/backendClient';
import { loadBanks, findBankByCode, findBranchByCode, type BankItem } from '../../services/bankLookup';
import { validateTaxId } from '../../services/companyLookup';
import type { Vendor } from '../../models/backend';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
} from 'lucide-react';

/**
 * 遮蔽帳號末 4 碼以外內容
 */
function maskAccountNumber(acc: string): string {
  if (!acc) return '-';
  const clean = acc.trim();
  if (clean.length <= 4) return '••••';
  const last4 = clean.slice(-4);
  return '••••••' + last4;
}

export const VendorsPanel: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 編輯 / 新增 Modal 狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({
    vendorName: '',
    taxId: '',
    entityType: '公司',
    bankCode: '',
    bankName: '',
    branchCode: '',
    branchName: '',
    accountName: '',
    accountNumber: '',
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // 載入廠商清單與銀行字典檔
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const [vendorList, bankList] = await Promise.all([
        backendStorageService.listVendors(),
        loadBanks().catch(() => [] as BankItem[]),
      ]);
      setVendors(vendorList);
      setBanks(bankList);
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setApiError(err.safeMessage);
      } else {
        setApiError('載入廠商資料時發生錯誤，請稍後再試。');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 當前選擇之銀行所對應的分行清單
  const currentBankBranches = useMemo(() => {
    if (!formData.bankCode || banks.length === 0) return [];
    const b = findBankByCode(banks, formData.bankCode);
    return b ? b.branches : [];
  }, [formData.bankCode, banks]);

  // 開啟新增 Modal
  const handleOpenCreate = () => {
    setEditingVendor(null);
    setFormData({
      vendorName: '',
      taxId: '',
      entityType: '公司',
      bankCode: '',
      bankName: '',
      branchCode: '',
      branchName: '',
      accountName: '',
      accountNumber: '',
      isActive: true,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 開啟編輯 Modal
  const handleOpenEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      vendorName: vendor.vendorName,
      taxId: vendor.taxId || '',
      entityType: vendor.entityType || '公司',
      bankCode: vendor.bankCode || '',
      bankName: vendor.bankName || '',
      branchCode: vendor.branchCode || '',
      branchName: vendor.branchName || '',
      accountName: vendor.accountName || '',
      accountNumber: vendor.accountNumber || '',
      isActive: vendor.isActive !== undefined ? Boolean(vendor.isActive) : true,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 關閉 Modal
  const handleCloseModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingVendor(null);
    setFormErrors({});
  };

  // 銀行代碼變更連動
  const handleBankCodeChange = (codeStr: string) => {
    const cleanCode = codeStr.trim();
    const matchedBank = findBankByCode(banks, cleanCode);
    setFormData((prev) => ({
      ...prev,
      bankCode: cleanCode,
      bankName: matchedBank ? matchedBank.name : prev.bankName,
      branchCode: '',
      branchName: '',
    }));
  };

  // 分行代碼變更連動
  const handleBranchCodeChange = (branchStr: string) => {
    const cleanBranch = branchStr.trim();
    const matchedBranch = findBranchByCode(currentBankBranches, cleanBranch);
    setFormData((prev) => ({
      ...prev,
      branchCode: cleanBranch,
      branchName: matchedBranch ? matchedBranch.name : prev.branchName,
    }));
  };

  // 驗證表單
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.vendorName.trim()) {
      errors.vendorName = '請填寫廠商名稱';
    }

    if (formData.taxId.trim()) {
      const cleanTax = formData.taxId.trim();
      if (cleanTax.length !== 8 || !validateTaxId(cleanTax)) {
        errors.taxId = '統一編號格式不正確 (需為 8 碼合法統編)';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 儲存廠商 (新增或更新)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !validateForm()) return;

    setIsSaving(true);
    setApiError(null);

    try {
      // 確保所有代碼與帳號欄位維持純 string，絕不轉換為數字
      const payload = {
        vendorId: editingVendor ? editingVendor.vendorId : undefined,
        vendorName: formData.vendorName.trim(),
        taxId: formData.taxId.trim(),
        entityType: formData.entityType.trim() || '公司',
        bankCode: formData.bankCode.trim(),
        bankName: formData.bankName.trim(),
        branchCode: formData.branchCode.trim(),
        branchName: formData.branchName.trim(),
        accountName: formData.accountName.trim(),
        accountNumber: formData.accountNumber.trim(),
        isActive: formData.isActive,
      };

      const saved = await backendStorageService.saveVendor(payload);

      if (editingVendor) {
        setVendors((prev) =>
          prev.map((v) => (v.vendorId === saved.vendorId ? saved : v))
        );
        showSuccessNotification('廠商資料已成功更新！');
      } else {
        setVendors((prev) => [saved, ...prev]);
        showSuccessNotification('新廠商已成功建立！');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setFormErrors({ submit: err.safeMessage });
      } else {
        setFormErrors({ submit: '儲存廠商時發生未預期錯誤，請稍後再試。' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const showSuccessNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  // 搜尋與排序 (active 優先，再依名稱排序)
  const filteredVendors = useMemo(() => {
    let list = [...vendors];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (v) =>
          v.vendorId.toLowerCase().includes(q) ||
          v.vendorName.toLowerCase().includes(q) ||
          (v.taxId && v.taxId.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      const aActive = a.isActive ? 1 : 0;
      const bActive = b.isActive ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return a.vendorName.localeCompare(b.vendorName, 'zh-TW');
    });

    return list;
  }, [vendors, searchQuery]);

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
            placeholder="搜尋廠商名稱、統一編號或廠商編號..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadInitialData}
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
            <span>新增廠商</span>
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

      {/* 廠商列表表格 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm">載入廠商資料中...</span>
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Building2 className="w-8 h-8 text-slate-300" />
            <span className="text-sm">
              {searchQuery ? '找不到符合條件的廠商' : '目前尚無廠商資料，請點選上方「新增廠商」'}
            </span>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs font-semibold">
                  <tr>
                    <th className="py-3 px-4">廠商名稱</th>
                    <th className="py-3 px-4">統一編號</th>
                    <th className="py-3 px-4">金融機構</th>
                    <th className="py-3 px-4">帳號 (遮蔽)</th>
                    <th className="py-3 px-4">戶名</th>
                    <th className="py-3 px-4">狀態</th>
                    <th className="py-3 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVendors.map((vendor) => (
                    <tr key={vendor.vendorId} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{vendor.vendorName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{vendor.vendorId}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {vendor.taxId || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {vendor.bankName || vendor.bankCode ? (
                          <div>
                            <span>{vendor.bankName || vendor.bankCode}</span>
                            {vendor.branchName && (
                              <span className="text-slate-400 ml-1">({vendor.branchName})</span>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {maskAccountNumber(vendor.accountNumber)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 text-xs">
                        {vendor.accountName || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            vendor.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {vendor.isActive ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(vendor)}
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
              {filteredVendors.map((vendor) => (
                <div key={vendor.vendorId} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900 text-sm">{vendor.vendorName}</div>
                      <div className="text-xs text-slate-600">統編：{vendor.taxId || '無'}</div>
                      <div className="text-[11px] font-mono text-slate-400">{vendor.vendorId}</div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                        vendor.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {vendor.isActive ? '啟用' : '停用'}
                    </span>
                  </div>

                  {/* 銀行帳戶摘要 */}
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                    <div className="text-slate-600">
                      <span className="text-slate-400">金融機構：</span>
                      {vendor.bankName || vendor.bankCode ? (
                        <span>
                          {vendor.bankName || vendor.bankCode}
                          {vendor.branchName ? ` (${vendor.branchName})` : ''}
                        </span>
                      ) : (
                        '未填寫'
                      )}
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <div>
                        <span className="text-slate-400">戶名：</span>
                        <span>{vendor.accountName || '-'}</span>
                      </div>
                      <div className="font-mono text-slate-700">
                        {maskAccountNumber(vendor.accountNumber)}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(vendor)}
                      className="w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>編輯廠商</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 新增 / 編輯廠商 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-700" />
                <h3 className="font-bold text-slate-900">
                  {editingVendor ? '編輯廠商資料' : '新增廠商'}
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
              {editingVendor && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    廠商編號 (唯讀)
                  </label>
                  <input
                    type="text"
                    value={editingVendor.vendorId}
                    disabled
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-500 cursor-not-allowed"
                  />
                </div>
              )}

              {/* 廠商名稱 */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  廠商名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.vendorName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      vendorName: val,
                      // 若未手動指定戶名，預設自動同步
                      accountName: prev.accountName === '' || prev.accountName === prev.vendorName ? val : prev.accountName,
                    }));
                  }}
                  placeholder="請輸入廠商全名"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
                {formErrors.vendorName && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.vendorName}</p>
                )}
              </div>

              {/* 統一編號與登記類型 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    統一編號 (8 碼)
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    placeholder="例如 12345678"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  {formErrors.taxId && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.taxId}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    登記類型
                  </label>
                  <select
                    value={formData.entityType}
                    onChange={(e) => setFormData({ ...formData, entityType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  >
                    <option value="公司">公司</option>
                    <option value="個人">個人 / 事務所</option>
                    <option value="其他">其他組織</option>
                  </select>
                </div>
              </div>

              {/* 金融機構資訊區塊 */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-slate-700">銀行匯款帳戶資訊</div>

                {/* 銀行代碼與名稱 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">金融機構代碼 (3 碼)</label>
                    <input
                      type="text"
                      maxLength={3}
                      value={formData.bankCode}
                      onChange={(e) => handleBankCodeChange(e.target.value)}
                      placeholder="例如 007"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">機構名稱</label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="例如 第一商業銀行"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                {/* 分行代碼與名稱 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">分行代碼 (4 碼)</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={formData.branchCode}
                      onChange={(e) => handleBranchCodeChange(e.target.value)}
                      placeholder="例如 1440"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">分行名稱</label>
                    <input
                      type="text"
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                      placeholder="例如 城東分行"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                {/* 戶名與帳號 (文字型態保護) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">戶名</label>
                    <input
                      type="text"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      placeholder="匯款戶名"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">帳號 (完整輸入，保持文字)</label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder="完整帳號 (含前導 0)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 啟用狀態 */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="vendorIsActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="vendorIsActive" className="text-xs font-medium text-slate-700 cursor-pointer">
                  啟用此廠商 (可於表單中選擇)
                </label>
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
                    <span>儲存廠商</span>
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
