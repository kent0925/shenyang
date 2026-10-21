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
import type { Vendor, VendorBankAccount, SaveVendorPayload } from '../../models/backend';
import { getBankAccountKey } from '../../services/vendorSync';
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
  Trash2,
  RotateCcw,
  Landmark,
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
  const [formData, setFormData] = useState<{
    vendorName: string;
    taxId: string;
    entityType: string;
    bankCode: string;
    bankName: string;
    branchCode: string;
    branchName: string;
    accountName: string;
    accountNumber: string;
    isActive: boolean;
    bankAccounts: VendorBankAccount[];
  }>({
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
    bankAccounts: [],
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

  // 當前選擇之銀行
  const currentBank = useMemo(() => {
    if (!formData.bankCode && !formData.bankName) return undefined;
    return (
      banks.find((b) => b.code === formData.bankCode) ||
      banks.find((b) => b.name === formData.bankName)
    );
  }, [formData.bankCode, formData.bankName, banks]);

  // 當前選擇之銀行所對應的分行清單
  const currentBankBranches = useMemo(() => {
    return currentBank ? currentBank.branches : [];
  }, [currentBank]);

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
      bankAccounts: [],
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  // 開啟編輯 Modal
  const handleOpenEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);

    let initialAccounts: VendorBankAccount[] = [];
    if (vendor.bankAccounts && Array.isArray(vendor.bankAccounts) && vendor.bankAccounts.length > 0) {
      initialAccounts = [...vendor.bankAccounts];
    } else if (vendor.accountNumber || vendor.bankCode) {
      initialAccounts = [{
        bankCode: vendor.bankCode || '',
        bankName: vendor.bankName || '',
        branchCode: vendor.branchCode || '',
        branchName: vendor.branchName || '',
        accountName: vendor.accountName || vendor.vendorName || '',
        accountNumber: vendor.accountNumber || '',
      }];
    }

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
      bankAccounts: initialAccounts,
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

  // 下拉選單選擇銀行
  const handleBankSelect = (codeStr: string) => {
    const matchedBank = findBankByCode(banks, codeStr);
    setFormData((prev) => ({
      ...prev,
      bankCode: codeStr,
      bankName: matchedBank ? matchedBank.name : prev.bankName,
      branchCode: '',
      branchName: '',
    }));
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

  // 下拉選單選擇分行
  const handleBranchSelect = (branchCodeStr: string) => {
    const matchedBranch = findBranchByCode(currentBankBranches, branchCodeStr);
    setFormData((prev) => ({
      ...prev,
      branchCode: branchCodeStr,
      branchName: matchedBranch ? matchedBranch.name : prev.branchName,
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

  // 清空當前輸入欄位之銀行與帳號
  const handleClearFormBankData = () => {
    setFormData((prev) => ({
      ...prev,
      bankCode: '',
      bankName: '',
      branchCode: '',
      branchName: '',
      accountName: '',
      accountNumber: '',
    }));
  };

  // 載入某筆已登記帳號至下方欄位以供編輯
  const handleLoadAccountToForm = (acc: VendorBankAccount) => {
    setFormData((prev) => ({
      ...prev,
      bankCode: acc.bankCode || '',
      bankName: acc.bankName || '',
      branchCode: acc.branchCode || '',
      branchName: acc.branchName || '',
      accountName: acc.accountName || '',
      accountNumber: acc.accountNumber || '',
    }));
  };

  // 從已登記帳號清單中刪除一組帳號
  const handleDeleteVendorAccount = (idxToDelete: number) => {
    const target = formData.bankAccounts[idxToDelete];
    if (!target) return;
    const bDisplay = `${target.bankName || ''}${target.bankCode ? ` (${target.bankCode})` : ''}`;
    if (!window.confirm(`確定要刪除此組已登記帳號嗎？\n\n金融機構：${bDisplay || '未指定'}\n帳號：${target.accountNumber || '無'}`)) {
      return;
    }

    const updatedAccounts = formData.bankAccounts.filter((_, i) => i !== idxToDelete);
    const nextPrimary = updatedAccounts[0];

    // 若當前輸入欄位剛好是這筆被刪除的帳號，切換至剩餘的第一筆或清空
    const isEditingThisAcc =
      formData.accountNumber === target.accountNumber &&
      (formData.bankCode === target.bankCode || formData.bankName === target.bankName);

    setFormData((prev) => ({
      ...prev,
      bankAccounts: updatedAccounts,
      ...(isEditingThisAcc
        ? {
            bankCode: nextPrimary ? nextPrimary.bankCode : '',
            bankName: nextPrimary ? nextPrimary.bankName : '',
            branchCode: nextPrimary ? nextPrimary.branchCode : '',
            branchName: nextPrimary ? nextPrimary.branchName : '',
            accountName: nextPrimary ? nextPrimary.accountName : '',
            accountNumber: nextPrimary ? nextPrimary.accountNumber : '',
          }
        : {}),
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
      // 整合目前輸入欄位與 bankAccounts 清單
      let finalAccounts = [...formData.bankAccounts];
      const curBankCode = formData.bankCode.trim();
      const curBankName = formData.bankName.trim();
      const curBranchCode = formData.branchCode.trim();
      const curBranchName = formData.branchName.trim();
      const curAccountName = formData.accountName.trim();
      const curAccountNumber = formData.accountNumber.trim();

      if (curAccountNumber || curBankCode || curBankName) {
        const curAcc: VendorBankAccount = {
          bankCode: curBankCode,
          bankName: curBankName,
          branchCode: curBranchCode,
          branchName: curBranchName,
          accountName: curAccountName || formData.vendorName.trim(),
          accountNumber: curAccountNumber,
        };
        const curKey = getBankAccountKey(curAcc);
        const matchIdx = finalAccounts.findIndex((a) => getBankAccountKey(a) === curKey);
        if (matchIdx >= 0) {
          finalAccounts[matchIdx] = curAcc;
        } else {
          finalAccounts.push(curAcc);
        }
      }

      const primaryAcc = finalAccounts[0];

      // 確保所有代碼與帳號欄位維持純 string，絕不轉換為數字
      const payload: SaveVendorPayload = {
        vendorId: editingVendor ? editingVendor.vendorId : undefined,
        vendorName: formData.vendorName.trim(),
        taxId: formData.taxId.trim(),
        entityType: formData.entityType.trim() || '公司',
        bankCode: primaryAcc ? (primaryAcc.bankCode || '') : curBankCode,
        bankName: primaryAcc ? (primaryAcc.bankName || '') : curBankName,
        branchCode: primaryAcc ? (primaryAcc.branchCode || '') : curBranchCode,
        branchName: primaryAcc ? (primaryAcc.branchName || '') : curBranchName,
        accountName: primaryAcc ? (primaryAcc.accountName || '') : curAccountName,
        accountNumber: primaryAcc ? (primaryAcc.accountNumber || '') : curAccountNumber,
        bankAccounts: finalAccounts,
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
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Landmark className="w-3.5 h-3.5 text-slate-600" />
                    <span>銀行匯款帳戶資訊</span>
                  </div>
                  {(formData.bankCode || formData.bankName || formData.accountNumber) && (
                    <button
                      type="button"
                      onClick={handleClearFormBankData}
                      className="text-[11px] text-slate-500 hover:text-red-600 px-2 py-0.5 rounded border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      清空帳戶資料
                    </button>
                  )}
                </div>

                {/* 若有已儲存帳號，顯示清單供快速載入或刪除 */}
                {formData.bankAccounts && formData.bankAccounts.length > 0 && (
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-600">
                      已登記匯款帳號（共 {formData.bankAccounts.length} 組）：
                    </div>
                    {formData.bankAccounts.map((acc, idx) => {
                      const curKey = getBankAccountKey({
                        bankCode: formData.bankCode,
                        bankName: formData.bankName,
                        branchCode: formData.branchCode,
                        branchName: formData.branchName,
                        accountNumber: formData.accountNumber,
                      });
                      const isCurrent = getBankAccountKey(acc) === curKey;
                      const bankDisplay = `${acc.bankName || ''}${acc.bankCode ? ` (${acc.bankCode})` : ''}`;
                      const branchDisplay = `${acc.branchName || ''}${acc.branchCode ? ` (${acc.branchCode})` : ''}`;

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded border text-xs transition-colors ${
                            isCurrent
                              ? 'bg-blue-50 border-blue-200 text-blue-900 font-medium'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => handleLoadAccountToForm(acc)}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{bankDisplay || '未指定銀行'}</span>
                              {branchDisplay && <span className="text-slate-500">／ {branchDisplay}</span>}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              帳號：<span className="font-semibold text-slate-800">{acc.accountNumber || '無帳號'}</span>
                              {acc.accountName && <span className="ml-2 font-normal">戶名：{acc.accountName}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleLoadAccountToForm(acc)}
                              className="px-2 py-0.5 text-[11px] text-blue-600 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                            >
                              載入編輯
                            </button>
                            <button
                              type="button"
                              title="刪除此組已登記帳號"
                              onClick={() => handleDeleteVendorAccount(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 銀行代碼與名稱雙向連動 */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-500 mb-1">機構代碼 (3 碼)</label>
                    <input
                      type="text"
                      maxLength={3}
                      value={formData.bankCode}
                      onChange={(e) => handleBankCodeChange(e.target.value)}
                      placeholder="例如 013, 007"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] text-slate-500 mb-1">機構名稱 (下拉選取或自動帶入)</label>
                    <select
                      value={currentBank ? currentBank.code : ''}
                      onChange={(e) => handleBankSelect(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- 請選擇金融機構 ({banks.length} 家) --</option>
                      {banks.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.code} {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 分行代碼與名稱雙向連動 */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-500 mb-1">分支代碼 (4 碼)</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={formData.branchCode}
                      onChange={(e) => handleBranchCodeChange(e.target.value)}
                      placeholder="例如 0545, 1440"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] text-slate-500 mb-1">
                      分支名稱 {currentBankBranches.length > 0 ? `(已篩選 ${currentBankBranches.length} 家分行)` : ''}
                    </label>
                    {currentBankBranches.length > 0 ? (
                      <select
                        value={formData.branchCode}
                        onChange={(e) => handleBranchSelect(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- 請選擇分行 ({currentBankBranches.length} 家) --</option>
                        {currentBankBranches.map((br) => (
                          <option key={br.code} value={br.code}>
                            {br.code} {br.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={formData.branchName}
                        onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                        placeholder="請先選擇金融機構或手動輸入分行名稱"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                      />
                    )}
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
                      placeholder="匯款戶名 (預設同廠商名稱)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">帳號 (保留前置 0，純文字)</label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder="完整帳號 (含分行代碼與前置 0)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
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
