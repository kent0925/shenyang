import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PaymentRequestData } from '../../models/paymentRequest';
import { DEFAULT_COMPANIES } from '../../models/sealApproval';
import type { Project, Vendor, BudgetItem, FormRecord, SubProject, VendorBankAccount } from '../../models/backend';
import { getBankAccountKey } from '../../services/vendorSync';
import { backendStorageService } from '../../services/backendStorage';
import { calculateBudgetUsage, BudgetUsageSummary } from '../../services/budgetUsage';
import {
  AlertCircle,
  Calendar,
  DollarSign,
  Building2,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Building,
  Landmark,
  AlertTriangle,
  RotateCw,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { calculatePayableAmount, formatCurrency } from '../../utils/format';
import { validateTaxId, lookupCompanyByTaxId } from '../../services/companyLookup';
import {
  loadBanks,
  findBankByCode,
  findBranchByCode,
  FinancialInstitution,
} from '../../services/bankLookup';

interface Props {
  data: PaymentRequestData;
  onChange: (data: PaymentRequestData) => void;
  errors: Record<string, string>;
  currentFormId?: string;
  onOverBudgetChange?: (isOver: boolean) => void;
}

export const PaymentRequestForm: React.FC<Props> = ({
  data,
  onChange,
  errors,
  currentFormId,
  onOverBudgetChange,
}) => {
  const [banks, setBanks] = useState<FinancialInstitution[]>([]);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [companySearchMsg, setCompanySearchMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // 主檔資料狀態
  const [projects, setProjects] = useState<Project[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [projectForms, setProjectForms] = useState<FormRecord[]>([]);
  const [isLoadingMaster, setIsLoadingMaster] = useState(false);
  const [isLoadingBudget, setIsLoadingBudget] = useState(false);
  const [isManualProjectMode, setIsManualProjectMode] = useState<boolean>(!data.projectId && !!data.project);

  const lastQueriedTaxIdRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const taxIdSourceRef = useRef<'vendorMaster' | 'manual'>('manual');

  // 初始化載入銀行清單與主檔 (專案、廠商)
  useEffect(() => {
    loadBanks()
      .then(setBanks)
      .catch((err) => {
        console.warn('載入金融機構資料失敗:', err);
      });

    setIsLoadingMaster(true);
    Promise.all([
      backendStorageService.listProjects().catch(() => [] as Project[]),
      backendStorageService.listSubProjects().catch(() => [] as SubProject[]),
      backendStorageService.listVendors().catch(() => [] as Vendor[]),
    ])
      .then(([projList, subList, vendList]) => {
        setProjects(projList);
        setSubProjects(subList);
        setVendors(vendList);
      })
      .finally(() => {
        setIsLoadingMaster(false);
      });
  }, []);

  // 當前年度判斷
  const currentYear = useMemo(() => {
    if (data.applyDate) {
      const parsed = parseInt(data.applyDate.split('-')[0], 10);
      if (Number.isFinite(parsed) && parsed > 1900) return parsed;
    }
    return new Date().getFullYear();
  }, [data.applyDate]);

  // 依公司篩選專案清單
  const filteredProjects = useMemo(() => {
    if (!data.company) return projects;
    return projects.filter((p) => !p.company || p.company === data.company);
  }, [projects, data.company]);

  // 當 projectId 或年度變更時載入預算項目與請款紀錄
  useEffect(() => {
    if (!data.projectId) {
      setBudgetItems([]);
      setProjectForms([]);
      return;
    }

    setIsLoadingBudget(true);
    Promise.all([
      backendStorageService.listBudgetItems({ year: currentYear, projectId: data.projectId, subProjectId: data.subProjectId }).catch(() => [] as BudgetItem[]),
      backendStorageService.listForms({ year: currentYear, formType: 'payment_request', projectId: data.projectId }).catch(() => [] as FormRecord[]),
    ])
      .then(([items, forms]) => {
        setBudgetItems(items);
        setProjectForms(forms);
      })
      .finally(() => {
        setIsLoadingBudget(false);
      });
  }, [data.projectId, data.subProjectId, currentYear]);

  // 選取的預算項目
  const selectedBudgetItem = useMemo(() => {
    if (!data.budgetItemId) return undefined;
    return budgetItems.find((b) => b.budgetItemId === data.budgetItemId);
  }, [budgetItems, data.budgetItemId]);

  // 新表單只能選 active 預算項目；既有表單若已連結 closed 項目仍保留顯示。
  const selectableBudgetItems = useMemo(() => {
    return budgetItems.filter(
      (item) => item.status === 'active' || item.budgetItemId === data.budgetItemId
    );
  }, [budgetItems, data.budgetItemId]);

  // 預算使用計算
  const budgetUsage: BudgetUsageSummary | null = useMemo(() => {
    if (data.budgetType === 'unbudgeted' || !data.budgetItemId || !selectedBudgetItem) {
      return null;
    }
    return calculateBudgetUsage({
      budgetAmount: selectedBudgetItem.budgetAmount,
      terminatedAmount: selectedBudgetItem.terminatedAmount,
      forms: projectForms,
      selectedBudgetItemId: data.budgetItemId,
      currentFormId,
      currentAmount: data.currentAmount,
    });
  }, [data.budgetType, data.budgetItemId, selectedBudgetItem, projectForms, currentFormId, data.currentAmount]);

  // 即時通知超額狀態
  useEffect(() => {
    if (data.budgetType === 'unbudgeted' || !data.budgetItemId || !budgetUsage) {
      onOverBudgetChange?.(false);
    } else {
      onOverBudgetChange?.(budgetUsage.isOverBudget);
    }
  }, [budgetUsage, data.budgetType, data.budgetItemId, onOverBudgetChange]);

  const taxIdValue = (data.vendorTaxId || '').trim();
  const isTaxIdValid = validateTaxId(taxIdValue);

  // 核心統一編號查詢邏輯（支援 AbortSignal 與自動/手動切換）
  const performTaxIdLookup = async (targetTaxId: string, isManual = false) => {
    const cleanId = (targetTaxId || '').trim();
    if (!cleanId || cleanId.length !== 8 || !validateTaxId(cleanId)) {
      if (isManual) {
        if (!cleanId) setCompanySearchMsg({ type: 'error', text: '請輸入統一編號' });
        else if (cleanId.length !== 8) setCompanySearchMsg({ type: 'error', text: '請輸入完整 8 碼統一編號' });
        else setCompanySearchMsg({ type: 'error', text: '統一編號檢核碼不符，請確認是否輸入正確' });
      }
      return;
    }

    if (!isManual && lastQueriedTaxIdRef.current === cleanId) {
      return;
    }

    // 終止前一個連線中的查詢
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearchingCompany(true);
    setCompanySearchMsg({ type: 'info', text: '正在查詢登記資料…' });

    try {
      const result = await lookupCompanyByTaxId(cleanId, controller.signal);
      if (controller.signal.aborted) return;
      lastQueriedTaxIdRef.current = cleanId;

      if (result && result.found && (result.name || result.companyName)) {
        const newVendor = (result.name || result.companyName)!.trim();
        const updates: Partial<PaymentRequestData> = {
          vendor: newVendor,
        };

        if (data.accountNameSameAsVendor !== false) {
          updates.accountName = newVendor;
          updates.bankAccount = {
            ...data.bankAccount,
            accountName: newVendor,
          };
        }

        onChange({
          ...data,
          ...updates,
        });

        setCompanySearchMsg({
          type: 'success',
          text: `✓ 已帶入：${newVendor}`,
        });
      } else if (result && result.entityType === 'branch') {
        setCompanySearchMsg({
          type: 'info',
          text: '此為分公司統一編號，請手動輸入受款人名稱。',
        });
      } else {
        setCompanySearchMsg({
          type: 'info',
          text: '查無登記資料，請確認統一編號或手動輸入受款人名稱。',
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      setCompanySearchMsg({
        type: 'error',
        text: err.message || '公司資料服務暫時無法使用，請稍後再試或手動輸入廠商名稱。',
      });
    } finally {
      if (!controller.signal.aborted) {
        setIsSearchingCompany(false);
      }
    }
  };

  // 滿 8 碼且新制校驗通過後 500ms Debounce 自動查詢
  useEffect(() => {
    // 若來源為廠商主檔帶入，不執行統編查詢
    if (taxIdSourceRef.current === 'vendorMaster') {
      return;
    }

    const cleanId = (data.vendorTaxId || '').trim();
    if (cleanId.length === 8 && validateTaxId(cleanId)) {
      const timer = setTimeout(() => {
        performTaxIdLookup(cleanId, false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      if (cleanId.length < 8) {
        lastQueriedTaxIdRef.current = '';
      }
    }
  }, [data.vendorTaxId]);

  const handleManualTaxIdLookup = () => {
    taxIdSourceRef.current = 'manual';
    performTaxIdLookup(taxIdValue, true);
  };

  // 手動編輯受款人名稱（若更動則清除已關聯的 vendorId，轉為手動受款人）
  const handleVendorChange = (newVendor: string) => {
    const matchedVendor = vendors.find((v) => v.vendorId === data.vendorId);
    const shouldClearVendorId = matchedVendor && matchedVendor.vendorName !== newVendor;

    const updates: Partial<PaymentRequestData> = {
      vendor: newVendor,
      vendorId: shouldClearVendorId ? '' : data.vendorId,
    };

    // Fix 2: 手動修改 Vendor 名稱時若清除了 vendorId，且當前 selectedBudgetItem 有指定 vendorId，一併清除 BudgetItem 關聯
    if (shouldClearVendorId && selectedBudgetItem && selectedBudgetItem.vendorId && selectedBudgetItem.vendorId.trim() !== '') {
      updates.budgetItemId = '';
      updates.budgetItemName = '';
    }

    if (data.accountNameSameAsVendor !== false) {
      updates.accountName = newVendor;
      updates.bankAccount = {
        ...data.bankAccount,
        accountName: newVendor,
      };
    }
    onChange({
      ...data,
      ...updates,
    });
  };

  // 從廠商主檔快速帶入 (字串維持保留前導 0)
  const handleSelectVendorFromMaster = (selectedVendorId: string) => {
    if (!selectedVendorId) {
      onChange({
        ...data,
        vendorId: '',
      });
      return;
    }
    const v = vendors.find((vend) => vend.vendorId === selectedVendorId);
    if (!v) return;

    // 標記來源為 vendorMaster，避免觸發 taxId lookup
    taxIdSourceRef.current = 'vendorMaster';
    lastQueriedTaxIdRef.current = (v.taxId || '').trim();
    if (companySearchMsg) setCompanySearchMsg(null);

    // 取得預設帳號（若有 bankAccounts 優先取第一筆，否則取平鋪欄位）
    let primaryAcc: Partial<VendorBankAccount> | undefined;
    if (v.bankAccounts && v.bankAccounts.length > 0) {
      primaryAcc = v.bankAccounts[0];
    } else if (v.accountNumber || v.bankCode) {
      primaryAcc = {
        bankCode: v.bankCode || '',
        bankName: v.bankName || '',
        branchCode: v.branchCode || '',
        branchName: v.branchName || '',
        accountName: v.accountName || v.vendorName,
        accountNumber: v.accountNumber || '',
      };
    }

    const bCode = primaryAcc?.bankCode || v.bankCode || '';
    const bName = primaryAcc?.bankName || v.bankName || '';
    const brCode = primaryAcc?.branchCode || v.branchCode || '';
    const brName = primaryAcc?.branchName || v.branchName || '';
    const accNum = primaryAcc?.accountNumber || v.accountNumber || '';
    const accName = primaryAcc?.accountName || v.accountName || v.vendorName;

    const updates: Partial<PaymentRequestData> = {
      vendorId: v.vendorId,
      vendor: v.vendorName,
      vendorTaxId: v.taxId || '',
      bankCode: bCode,
      bankName: bName,
      branchCode: brCode,
      branchName: brName,
      accountNumber: accNum,
      accountName: accName,
      accountNameSameAsVendor: true,
      bankAccount: {
        type: 'code',
        bankCode: bCode,
        bankName: bName,
        branch: brName || brCode,
        accountNumber: accNum,
        accountName: accName,
      },
    };

    // Fix 2: 若當前選定的 BudgetItem 有指定 vendorId 且與新選的 selectedVendorId 不相符，清除 BudgetItem 關聯
    if (selectedBudgetItem && selectedBudgetItem.vendorId && selectedBudgetItem.vendorId.trim() !== '') {
      if (selectedBudgetItem.vendorId !== selectedVendorId) {
        updates.budgetItemId = '';
        updates.budgetItemName = '';
      }
    }

    onChange({
      ...data,
      ...updates,
    });
  };

  // 當前選中之廠商主檔物件與其銀行帳號清單
  const selectedVendor = useMemo(() => {
    return vendors.find((v) => v.vendorId === data.vendorId);
  }, [vendors, data.vendorId]);

  const vendorBankAccounts: VendorBankAccount[] = useMemo(() => {
    if (!selectedVendor) return [];
    if (selectedVendor.bankAccounts && selectedVendor.bankAccounts.length > 0) {
      return selectedVendor.bankAccounts;
    }
    if (selectedVendor.accountNumber || selectedVendor.bankCode) {
      return [{
        bankCode: selectedVendor.bankCode || '',
        bankName: selectedVendor.bankName || '',
        branchCode: selectedVendor.branchCode || '',
        branchName: selectedVendor.branchName || '',
        accountName: selectedVendor.accountName || selectedVendor.vendorName,
        accountNumber: selectedVendor.accountNumber || '',
      }];
    }
    return [];
  }, [selectedVendor]);

  // 切換已儲存之匯款帳號
  const handleSelectStoredAccount = (acc: VendorBankAccount) => {
    const bCode = acc.bankCode || '';
    const bName = acc.bankName || '';
    const brCode = acc.branchCode || '';
    const brName = acc.branchName || '';
    const accNum = acc.accountNumber || '';
    const accName = acc.accountName || data.vendor;

    onChange({
      ...data,
      bankCode: bCode,
      bankName: bName,
      branchCode: brCode,
      branchName: brName,
      accountNumber: accNum,
      accountName: accName,
      bankAccount: {
        type: 'code',
        bankCode: bCode,
        bankName: bName,
        branch: brName || brCode,
        accountNumber: accNum,
        accountName: accName,
      },
    });
  };

  // 選擇「＋ 新增匯款帳號」模式
  const handleSelectNewAccountMode = () => {
    onChange({
      ...data,
      bankCode: '',
      bankName: '',
      branchCode: '',
      branchName: '',
      accountNumber: '',
      bankAccount: {
        type: 'code',
        bankCode: '',
        bankName: '',
        branch: '',
        accountNumber: '',
        accountName: data.accountName || data.vendor,
      },
    });
  };

  const currentBank = banks.find(
    (b) => b.code === data.bankCode || (data.bankName && b.name === data.bankName)
  );
  const currentBranches = currentBank ? currentBank.branches : [];

  const handleBankCodeChange = (code: string) => {
    const cleanCode = code.trim();
    const matched = findBankByCode(banks, cleanCode);
    const bankName = matched ? matched.name : (cleanCode === '' ? '' : data.bankName || '');

    onChange({
      ...data,
      bankCode: cleanCode,
      bankName,
      branchCode: '',
      branchName: '',
      bankAccount: {
        ...data.bankAccount,
        bankCode: cleanCode,
        bankName,
        branch: '',
      },
    });
  };

  const handleBankSelect = (selectedCode: string) => {
    if (!selectedCode) {
      onChange({
        ...data,
        bankCode: '',
        bankName: '',
        branchCode: '',
        branchName: '',
        bankAccount: {
          ...data.bankAccount,
          bankCode: '',
          bankName: '',
          branch: '',
        },
      });
      return;
    }
    const bank = findBankByCode(banks, selectedCode);
    if (bank) {
      onChange({
        ...data,
        bankCode: bank.code,
        bankName: bank.name,
        branchCode: '',
        branchName: '',
        bankAccount: {
          ...data.bankAccount,
          bankCode: bank.code,
          bankName: bank.name,
          branch: '',
        },
      });
    }
  };

  const handleBranchCodeChange = (code: string) => {
    const cleanCode = code.trim();
    const matched = findBranchByCode(currentBranches, cleanCode);
    const branchName = matched ? matched.name : (cleanCode === '' ? '' : data.branchName || '');

    onChange({
      ...data,
      branchCode: cleanCode,
      branchName,
      bankAccount: {
        ...data.bankAccount,
        branch: branchName || cleanCode,
      },
    });
  };

  const handleBranchSelect = (selectedCode: string) => {
    if (!selectedCode) {
      onChange({
        ...data,
        branchCode: '',
        branchName: '',
        bankAccount: {
          ...data.bankAccount,
          branch: '',
        },
      });
      return;
    }
    const branch = findBranchByCode(currentBranches, selectedCode);
    if (branch) {
      onChange({
        ...data,
        branchCode: branch.code,
        branchName: branch.name,
        bankAccount: {
          ...data.bankAccount,
          branch: branch.name,
        },
      });
    }
  };

  const handleAccountSameToggle = (checked: boolean) => {
    if (checked) {
      onChange({
        ...data,
        accountNameSameAsVendor: true,
        accountName: data.vendor,
        bankAccount: {
          ...data.bankAccount,
          accountName: data.vendor,
        },
      });
    } else {
      onChange({
        ...data,
        accountNameSameAsVendor: false,
      });
    }
  };

  const handleAccountNameChange = (name: string) => {
    onChange({
      ...data,
      accountName: name,
      bankAccount: {
        ...data.bankAccount,
        accountName: name,
      },
    });
  };

  const handleAccountNumberChange = (num: string) => {
    onChange({
      ...data,
      accountNumber: num,
      bankAccount: {
        ...data.bankAccount,
        accountNumber: num,
      },
    });
  };

  const updateSpecial = (fields: Partial<PaymentRequestData['specialRequirements']>) => {
    onChange({
      ...data,
      specialRequirements: { ...data.specialRequirements, ...fields },
    });
  };

  // 依據目前 specialRequirements 狀態推導大區塊
  const currentGroup: 'check' | 'other' | null = React.useMemo(() => {
    const hasCheck = Boolean(
      data.specialRequirements.cashiersCheck ||
      data.specialRequirements.postDatedCheck ||
      data.specialRequirements.noCross ||
      data.specialRequirements.noEndorse
    );
    const hasOther = Boolean(
      data.specialRequirements.wireTransfer ||
      data.specialRequirements.offsetBorrowing
    );
    if (hasCheck && !hasOther) return 'check';
    if (hasOther && !hasCheck) return 'other';
    return null;
  }, [data.specialRequirements]);

  // 記錄使用者主動點選的群組（支援尚未勾選子項目時之展開狀態）
  const [localGroup, setLocalGroup] = useState<'check' | 'other' | null>(null);
  const activeGroup = currentGroup || localGroup;

  // 使用者切換大區塊時執行互斥清理
  const handleSelectGroup = (group: 'check' | 'other') => {
    setLocalGroup(group);
    if (group === 'check') {
      onChange({
        ...data,
        specialRequirements: {
          ...data.specialRequirements,
          wireTransfer: false,
          offsetBorrowing: false,
        },
      });
    } else if (group === 'other') {
      onChange({
        ...data,
        specialRequirements: {
          ...data.specialRequirements,
          cashiersCheck: false,
          postDatedCheck: false,
          noCross: false,
          noEndorse: false,
          postDatedDate: '',
        },
      });
    }
  };

  // 支票種類二選一切換（cashiersCheck 與 postDatedCheck 互斥）
  const handleSelectCheckType = (type: 'cashiersCheck' | 'postDatedCheck') => {
    if (type === 'cashiersCheck') {
      onChange({
        ...data,
        specialRequirements: {
          ...data.specialRequirements,
          cashiersCheck: true,
          postDatedCheck: false,
          postDatedDate: '',
        },
      });
    } else if (type === 'postDatedCheck') {
      onChange({
        ...data,
        specialRequirements: {
          ...data.specialRequirements,
          postDatedCheck: true,
          cashiersCheck: false,
        },
      });
    }
  };

  const payable = calculatePayableAmount(
    data.currentAmount,
    data.retentionAmount,
    data.advanceDeduction,
    data.penaltyDiscount
  );

  const descLines = data.description ? data.description.split('\n') : [];
  const lineCount = descLines.length;
  const isOverLimit = lineCount > 16;

  return (
    <div className="space-y-6">
      {/* 區塊一：基本與案件資訊 */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>基本與案件資訊</span>
          </div>
          {isLoadingMaster && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              載入主檔資料中…
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 公司名稱 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              公司名稱 <span className="text-red-500">*</span>
            </label>
            <select
              value={DEFAULT_COMPANIES.includes(data.company) ? data.company : 'custom'}
              onChange={(e) => {
                const newCompany = e.target.value === 'custom' ? '' : e.target.value;
                // 更換公司時，連動清除專案與預算關聯
                onChange({
                  ...data,
                  company: newCompany,
                  project: '',
                  projectId: '',
                  subProjectId: '',
                  subProjectName: '',
                  budgetItemId: '',
                  budgetItemName: '',
                });
                setIsManualProjectMode(false);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {DEFAULT_COMPANIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="custom">-- 自行輸入其他公司 --</option>
            </select>
            {!DEFAULT_COMPANIES.includes(data.company) && (
              <input
                type="text"
                placeholder="請輸入公司完整名稱"
                value={data.company}
                onChange={(e) => onChange({ ...data, company: e.target.value })}
                className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            )}
            {errors.company && <p className="text-xs text-red-500 mt-1">{errors.company}</p>}
          </div>

          {/* 申請日期 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              申請日期 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={data.applyDate}
                onChange={(e) => onChange({ ...data, applyDate: e.target.value })}
                className="w-full px-3 py-2 pl-9 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
            {errors.applyDate && <p className="text-xs text-red-500 mt-1">{errors.applyDate}</p>}
          </div>

          {/* 專案代號/名稱 (連動專案主檔) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                專案名稱／代號 <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const nextMode = !isManualProjectMode;
                  setIsManualProjectMode(nextMode);
                  if (nextMode) {
                    onChange({
                      ...data,
                      projectId: '',
                      subProjectId: '',
                      subProjectName: '',
                      budgetItemId: '',
                      budgetItemName: '',
                    });
                  }
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                {isManualProjectMode ? '從專案主檔選取' : '手動自訂專案'}
              </button>
            </div>

            {isManualProjectMode ? (
              <input
                type="text"
                placeholder="請輸入自訂專案名稱"
                value={data.project}
                onChange={(e) =>
                  onChange({
                    ...data,
                    project: e.target.value,
                    projectId: '',
                    subProjectId: '',
                    subProjectName: '',
                    budgetItemId: '',
                    budgetItemName: '',
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
            ) : (
              <select
                value={data.projectId || ''}
                onChange={(e) => {
                  const pid = e.target.value;
                  if (!pid) {
                    onChange({
                      ...data,
                      projectId: '',
                      subProjectId: '',
                      subProjectName: '',
                      project: '',
                      budgetItemId: '',
                      budgetItemName: '',
                    });
                  } else {
                    const matched = projects.find((p) => p.projectId === pid);
                    onChange({
                      ...data,
                      projectId: pid,
                      subProjectId: '',
                      subProjectName: '',
                      project: matched ? matched.projectName : data.project,
                      budgetItemId: '',
                      budgetItemName: '',
                    });
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- 請選擇專案主檔 ({filteredProjects.length} 案) --</option>
                {filteredProjects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName} {p.status !== 'active' ? '(已封存)' : ''}
                  </option>
                ))}
              </select>
            )}
            {errors.project && <p className="text-xs text-red-500 mt-1">{errors.project}</p>}
          </div>

          {/* 分案（固定為主專案下第二層） */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">分案 <span className="text-red-500">*</span></label>
            <select
              value={data.subProjectId || ''}
              disabled={!data.projectId}
              onChange={(e) => {
                const sid = e.target.value;
                const matched = subProjects.find((s) => s.subProjectId === sid);
                onChange({ ...data, subProjectId: sid, subProjectName: matched?.subProjectName || '', budgetItemId: '', budgetItemName: '' });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100"
            >
              <option value="">-- 請選擇分案 --</option>
              {subProjects.filter((s) => s.projectId === data.projectId).map((s) => <option key={s.subProjectId} value={s.subProjectId}>{s.subProjectName}{s.status !== 'active' ? '（停用）' : ''}</option>)}
            </select>
            {errors.subProjectId && <p className="text-xs text-red-500 mt-1">{errors.subProjectId}</p>}
          </div>

          {/* 請購單編號 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              請購單編號
            </label>
            <input
              type="text"
              placeholder="請購單號"
              value={data.requisitionNumber}
              onChange={(e) => onChange({ ...data, requisitionNumber: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* 費用歸屬部門 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              費用歸屬部門
            </label>
            <input
              type="text"
              placeholder="例如：工務部、財務部、總管理處"
              value={data.department}
              onChange={(e) => onChange({ ...data, department: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* 合約/訂購單編號 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              合約／訂購單編號
            </label>
            <input
              type="text"
              placeholder="合約或訂單編號"
              value={data.contractNumber}
              onChange={(e) => onChange({ ...data, contractNumber: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* 預算控制配置區 (Budget Type & BudgetItem) */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* 預算類型切換 */}
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                預算控管類型
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="budgetType"
                    value="budgeted"
                    checked={data.budgetType !== 'unbudgeted'}
                    onChange={() =>
                      onChange({
                        ...data,
                        budgetType: 'budgeted',
                      })
                    }
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium text-slate-800">有預算</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="budgetType"
                    value="unbudgeted"
                    checked={data.budgetType === 'unbudgeted'}
                    onChange={() =>
                      onChange({
                        ...data,
                        budgetType: 'unbudgeted',
                        budgetItemId: '',
                        budgetItemName: '',
                      })
                    }
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-600">無預算（非專案/專案外費用）</span>
                </label>
              </div>
            </div>

            {/* 預算項目下拉 (僅在有預算時顯示) */}
            {data.budgetType !== 'unbudgeted' && (
              <div className="md:col-span-8">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    預算項目 (年度: {currentYear}) <span className="text-red-500">*</span>
                  </label>
                  {isLoadingBudget && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> 讀取預算額度中…
                    </span>
                  )}
                </div>

                {!data.projectId || !data.subProjectId ? (
                  <div className="p-2 bg-slate-100 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                    請先於上方選擇「專案主檔」與「分案」，方可載入該分案之預算項目。
                  </div>
                ) : (
                  <select
                    value={data.budgetItemId || ''}
                    onChange={(e) => {
                      const bId = e.target.value;
                      const matched = budgetItems.find((b) => b.budgetItemId === bId);
                      const updates: Partial<PaymentRequestData> = {
                        budgetItemId: bId,
                        budgetItemName: matched ? matched.itemName : '',
                      };
                      // 預算項目指定的廠商是 authoritative relation，選取時一律同步。
                      if (matched && matched.vendorId) {
                        const matchedVend = vendors.find((v) => v.vendorId === matched.vendorId);
                        if (matchedVend) {
                          updates.vendorId = matchedVend.vendorId;
                          updates.vendor = matchedVend.vendorName;
                          updates.vendorTaxId = matchedVend.taxId || '';
                          updates.bankCode = matchedVend.bankCode || '';
                          updates.bankName = matchedVend.bankName || '';
                          updates.branchCode = matchedVend.branchCode || '';
                          updates.branchName = matchedVend.branchName || '';
                          updates.accountNumber = matchedVend.accountNumber || '';
                          updates.accountName = matchedVend.accountName || matchedVend.vendorName;
                          updates.bankAccount = {
                            type: 'code',
                            bankCode: matchedVend.bankCode || '',
                            bankName: matchedVend.bankName || '',
                            branch: matchedVend.branchName || matchedVend.branchCode || '',
                            accountNumber: matchedVend.accountNumber || '',
                            accountName: matchedVend.accountName || matchedVend.vendorName,
                          };
                        }
                      }
                      onChange({
                        ...data,
                        ...updates,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">-- 請選擇預算項目 ({selectableBudgetItems.length} 項) --</option>
                    {selectableBudgetItems.map((b) => (
                      <option key={b.budgetItemId} value={b.budgetItemId}>
                        {b.itemName}（預算額: NT$ {formatCurrency(b.budgetAmount)}
                        {b.terminatedAmount ? ` / 終止: NT$ ${formatCurrency(b.terminatedAmount)}` : ''}）
                        {b.status === 'closed' ? ' [已結案]' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {errors.budgetItemId && <p className="text-xs text-red-500 mt-1">{errors.budgetItemId}</p>}
              </div>
            )}
          </div>

          {/* 預算控制即時 Summary 卡片 */}
          {data.budgetType !== 'unbudgeted' && data.budgetItemId && budgetUsage && (
            <div
              className={`mt-4 p-4 rounded-xl border transition-all ${
                budgetUsage.isOverBudget
                  ? 'bg-red-50/70 border-red-200'
                  : 'bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wallet
                    className={`w-4 h-4 ${
                      budgetUsage.isOverBudget ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-800">
                    預算控管即時審核明細（項目：{data.budgetItemName || selectedBudgetItem?.itemName}）
                  </span>
                </div>
                <div>
                  {budgetUsage.isOverBudget ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5" /> 超出預算上限
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 預算額度合規
                    </span>
                  )}
                </div>
              </div>

              {/* 預算數據網格 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block">原預算額</span>
                  <span className="font-bold text-slate-800 font-mono text-sm">
                    NT$ {formatCurrency(budgetUsage.budgetAmount)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block">終止扣除額</span>
                  <span className="font-bold text-slate-600 font-mono text-sm">
                    NT$ {formatCurrency(budgetUsage.terminatedAmount)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block">有效可用預算</span>
                  <span className="font-bold text-blue-700 font-mono text-sm">
                    NT$ {formatCurrency(budgetUsage.effectiveBudget)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block">其他已送審/核銷</span>
                  <span className="font-bold text-slate-700 font-mono text-sm">
                    NT$ {formatCurrency(budgetUsage.usedOther)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block">本次請款金額</span>
                  <span className="font-bold text-amber-700 font-mono text-sm">
                    NT$ {formatCurrency(budgetUsage.currentAmount)}
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border ${
                    budgetUsage.isOverBudget
                      ? 'bg-red-100/50 border-red-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <span className="text-slate-500 block">本次請款後餘額</span>
                  <span
                    className={`font-bold font-mono text-sm ${
                      budgetUsage.isOverBudget ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    NT$ {formatCurrency(budgetUsage.remainingAfterCurrent)}
                  </span>
                </div>
              </div>

              {/* 超額警示通知 */}
              {budgetUsage.isOverBudget && (
                <div className="mt-3 p-2.5 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>
                    <strong>預算超支警示：</strong>本次請款金額已超出剩餘預算額度 NT${' '}
                    <strong>{formatCurrency(budgetUsage.overAmount)}</strong>，後端將阻擋儲存。請調降請款金額或辦理追加預算。
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 區塊二：受款人與匯款資訊 */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">受款人／廠商與匯款帳號</h3>
          </div>
          {/* 廠商主檔快速帶入選單 */}
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <select
              value={data.vendorId || ''}
              onChange={(e) => handleSelectVendorFromMaster(e.target.value)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 max-w-xs"
            >
              <option value="">-- 從廠商主檔快速帶入 (選填) --</option>
              {vendors.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorName} {v.taxId ? `(${v.taxId})` : ''} {!v.isActive ? '(已停用)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 統一編號與受款人/廠商 */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 統一編號 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  統一編號（選填）
                </label>
                {taxIdValue.length > 0 && (
                  <span className="text-[11px]">
                    {taxIdValue.length === 8 ? (
                      isTaxIdValid ? (
                        <span className="text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 8碼校驗碼合規
                        </span>
                      ) : (
                        <span className="text-red-500 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> 校驗碼不符
                        </span>
                      )
                    ) : (
                      <span className="text-slate-400">已輸入 {taxIdValue.length}/8 碼</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={8}
                  placeholder="8 碼數字"
                  value={data.vendorTaxId || ''}
                  onChange={(e) => {
                    taxIdSourceRef.current = 'manual';
                    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                    const shouldClearVendorId = !!data.vendorId;
                    onChange({
                      ...data,
                      vendorTaxId: val,
                      vendorId: shouldClearVendorId ? '' : data.vendorId,
                    });
                    if (companySearchMsg) setCompanySearchMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleManualTaxIdLookup();
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={handleManualTaxIdLookup}
                  disabled={isSearchingCompany || taxIdValue.length !== 8 || !isTaxIdValid}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-300 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors flex-shrink-0 border border-slate-200 disabled:border-slate-100 cursor-pointer disabled:cursor-not-allowed"
                  title="手動重新查詢登記資料"
                >
                  {isSearchingCompany ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span className="text-blue-600">查詢中</span>
                    </>
                  ) : (
                    <>
                      <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                      <span>重新查詢</span>
                    </>
                  )}
                </button>
              </div>
              {companySearchMsg && (
                <p
                  className={`text-xs mt-1.5 flex items-center gap-1 ${
                    companySearchMsg.type === 'success'
                      ? 'text-emerald-600'
                      : companySearchMsg.type === 'error'
                      ? 'text-red-500'
                      : 'text-blue-600'
                  }`}
                >
                  {companySearchMsg.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                  {companySearchMsg.type === 'error' && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {companySearchMsg.type === 'info' && <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />}
                  <span>{companySearchMsg.text}</span>
                </p>
              )}
            </div>

            {/* 受款人/廠商名稱 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  受款人／廠商名稱 <span className="text-red-500">*</span>
                </label>
                {data.vendorId && (
                  <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">
                    已連結主檔
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="請輸入廠商全名或個人受款姓名"
                value={data.vendor}
                onChange={(e) => handleVendorChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {errors.vendor && <p className="text-xs text-red-500 mt-1">{errors.vendor}</p>}
            </div>
          </div>
        </div>

        {/* 金融機構與帳號結構化輸入 */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Landmark className="w-4 h-4 text-slate-600" />
              <span>匯款金融機構與帳號明細</span>
            </div>
            <span className="text-[11px] text-slate-400">依官方金融機構代碼與分支機構資料庫雙向連動</span>
          </div>

          {/* 若廠商主檔有已儲存帳號，提供快速切換與新增選項 */}
          {data.vendorId && vendorBankAccounts.length > 0 && (() => {
            const currentAccKey = getBankAccountKey({
              bankCode: data.bankCode,
              bankName: data.bankName,
              branchCode: data.branchCode,
              branchName: data.branchName || data.bankAccount?.branch,
              accountNumber: data.accountNumber || data.bankAccount?.accountNumber,
            });
            const matchingIndex = vendorBankAccounts.findIndex(
              (acc) => getBankAccountKey(acc) === currentAccKey
            );
            const isNewAccountMode = matchingIndex === -1;

            return (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>選擇廠商已登記之匯款帳號（共 {vendorBankAccounts.length} 組）：</span>
                  {isNewAccountMode && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-200">
                      填寫新帳號模式（儲存後自動新增至主檔）
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {vendorBankAccounts.map((acc, idx) => {
                    const accKey = getBankAccountKey(acc);
                    const isSelected = matchingIndex === idx;
                    const bankDisplay = `${acc.bankName || ''}${acc.bankCode ? ` (${acc.bankCode})` : ''}`;
                    const branchDisplay = `${acc.branchName || ''}${acc.branchCode ? ` (${acc.branchCode})` : ''}`;
                    return (
                      <label
                        key={accKey || idx}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vendorStoredAccount"
                          checked={isSelected}
                          onChange={() => handleSelectStoredAccount(acc)}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{bankDisplay || '未指定銀行'}</span>
                            {branchDisplay && <span className="text-slate-500">／ {branchDisplay}</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            帳號：<span className="font-mono text-slate-800 font-semibold">{acc.accountNumber || '無帳號'}</span>
                            {acc.accountName && <span className="ml-3">戶名：{acc.accountName}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}

                  {/* ＋ 新增匯款帳號 Radio */}
                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      isNewAccountMode
                        ? 'bg-amber-50 border-amber-300 text-amber-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="vendorStoredAccount"
                      checked={isNewAccountMode}
                      onChange={handleSelectNewAccountMode}
                      className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>＋ 新增匯款帳號（於下方輸入明細，存檔後自動累積至此廠商）</span>
                  </label>
                </div>
              </div>
            );
          })()}

          {/* 第一列：金融機構代碼與名稱 */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                機構代碼（3 碼）
              </label>
              <input
                type="text"
                maxLength={3}
                placeholder="如 007, 700"
                value={data.bankCode || ''}
                onChange={(e) => handleBankCodeChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="sm:col-span-8">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                金融機構名稱（可下拉選取或由代碼自動帶入）
              </label>
              <select
                value={currentBank ? currentBank.code : ''}
                onChange={(e) => handleBankSelect(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- 請選擇或輸入金融機構代碼 --</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 第二列：分支代碼與分支名稱 */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                分支代碼（4 碼）
              </label>
              <input
                type="text"
                maxLength={4}
                placeholder="如 1440, 0021"
                value={data.branchCode || ''}
                onChange={(e) => handleBranchCodeChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="sm:col-span-8">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                分支名稱（已依金融機構篩選分支機構）
              </label>
              {currentBranches.length > 0 ? (
                <select
                  value={data.branchCode || ''}
                  onChange={(e) => handleBranchSelect(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- 請選擇分支機構 ({currentBranches.length} 家) --</option>
                  {currentBranches.map((br) => (
                    <option key={br.code} value={br.code}>
                      {br.code} {br.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="請先選擇金融機構或手動輸入分支名稱"
                  value={data.branchName || ''}
                  onChange={(e) => {
                    const name = e.target.value;
                    onChange({
                      ...data,
                      branchName: name,
                      bankAccount: { ...data.bankAccount, branch: name },
                    });
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                />
              )}
            </div>
          </div>

          {/* 第三列：戶名與帳號 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600">戶名</label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={data.accountNameSameAsVendor !== false}
                    onChange={(e) => handleAccountSameToggle(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>同受款人／廠商名稱</span>
                </label>
              </div>
              <input
                type="text"
                readOnly={data.accountNameSameAsVendor !== false}
                placeholder="戶名"
                value={
                  data.accountNameSameAsVendor !== false
                    ? data.vendor
                    : data.accountName || data.bankAccount?.accountName || ''
                }
                onChange={(e) => handleAccountNameChange(e.target.value)}
                className={`w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 ${
                  data.accountNameSameAsVendor !== false ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                帳號（保留前置 0）
              </label>
              <input
                type="text"
                placeholder="匯款帳號（如 007123456789）"
                value={data.accountNumber || data.bankAccount?.accountNumber || ''}
                onChange={(e) => handleAccountNumberChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
              {(() => {
                const isPost = data.bankCode === '700';
                const isPostPassbook = isPost && (data.branchCode === '0021' || (data.branchName && data.branchName.includes('存簿')));
                const isPostGiro = isPost && (data.branchCode === '0010' || (data.branchName && data.branchName.includes('劃撥')));
                const accNum = (data.accountNumber || '').trim();
                let warning: string | null = null;
                if (isPostPassbook && accNum.length > 0 && accNum.length !== 14) {
                  warning = '郵政存簿儲金帳號通常為 14 位，請確認帳號。';
                } else if (isPostGiro && accNum.length > 0 && accNum.length !== 8) {
                  warning = '郵政劃撥儲金帳號通常為 8 位，請確認帳號。';
                }
                return warning ? (
                  <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{warning}</span>
                  </p>
                ) : null;
              })()}
            </div>
          </div>

          {/* 隱私與安全提示 */}
          <div className="mt-2 pt-2.5 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              只有使用者主動使用統編查詢時，8 碼統編會送至 Vercel 查詢 Proxy 並轉送政府公開商工資料服務。廠商名稱、戶名、銀行帳號、金額、請款內容及 Excel/PDF 不會被 Proxy 儲存或傳送。
            </span>
          </div>
        </div>
      </div>

      {/* 區塊三：金額與付款明細 */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" />
          <span>金額與付款明細</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* 費用性質 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">費用性質</label>
            <input
              type="text"
              placeholder="例如：修繕費、工程款、採購款"
              value={data.expenseNature}
              onChange={(e) => onChange({ ...data, expenseNature: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* 合約/訂購總額 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">合約／訂購單總額</label>
            <input
              type="text"
              placeholder="金額"
              value={data.contractTotal}
              onChange={(e) => onChange({ ...data, contractTotal: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white font-mono"
            />
          </div>

          {/* 付款到期日 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">付款到期日</label>
            <div className="relative">
              <input
                type="date"
                value={data.dueDate}
                onChange={(e) => onChange({ ...data, dueDate: e.target.value })}
                className="w-full px-3 py-2 pl-9 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 本期明細 */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg">
          <p className="text-xs font-bold text-slate-700 mb-2">本期款項明細：</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">(1) 請款/驗收/預付額 <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="0"
                value={data.currentAmount}
                onChange={(e) => onChange({ ...data, currentAmount: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono text-right"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">(2) 保留金額</label>
              <input
                type="text"
                placeholder="0"
                value={data.retentionAmount}
                onChange={(e) => onChange({ ...data, retentionAmount: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono text-right"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">(3) 預付款沖銷</label>
              <input
                type="text"
                placeholder="0"
                value={data.advanceDeduction}
                onChange={(e) => onChange({ ...data, advanceDeduction: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono text-right"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">(4) 罰扣（折讓金額）</label>
              <input
                type="text"
                placeholder="0"
                value={data.penaltyDiscount}
                onChange={(e) => onChange({ ...data, penaltyDiscount: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono text-right"
              />
            </div>
          </div>

          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900">
              實付金額預覽：
            </span>
            <span className="text-base font-bold font-mono text-blue-700">
              NT$ {formatCurrency(payable)}
            </span>
          </div>
          {errors.currentAmount && <p className="text-xs text-red-500 mt-1">{errors.currentAmount}</p>}
        </div>
      </div>

      {/* 區塊四：付款方式 */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3">付款方式</h3>

        <div className="space-y-3">
          {/* 大區塊 A：開立支票 */}
          <div
            className={`border rounded-lg transition-colors p-3.5 ${
              activeGroup === 'check'
                ? 'bg-white border-blue-300 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-slate-100/60 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="radio"
                name="paymentGroup"
                value="check"
                checked={activeGroup === 'check'}
                onChange={() => handleSelectGroup('check')}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
              />
              <span className="text-sm font-bold text-slate-800">開立支票</span>
            </label>

            {activeGroup === 'check' && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-4 pl-6">
                {/* 支票種類（二選一） */}
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    支票種類（二選一）
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="checkType"
                        value="cashiersCheck"
                        checked={Boolean(data.specialRequirements.cashiersCheck)}
                        onChange={() => handleSelectCheckType('cashiersCheck')}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <span>請開立本票／台銀支票</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="checkType"
                        value="postDatedCheck"
                        checked={Boolean(data.specialRequirements.postDatedCheck)}
                        onChange={() => handleSelectCheckType('postDatedCheck')}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <span>請付遠期支票予受款者</span>
                    </label>

                    {/* 遠期支票指定兌現日期 */}
                    {data.specialRequirements.postDatedCheck && (
                      <div className="pl-6 pt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                        <span className="font-semibold">指定兌現日期：</span>
                        <input
                          type="date"
                          value={data.specialRequirements.postDatedDate}
                          onChange={(e) => updateSpecial({ postDatedDate: e.target.value })}
                          className="px-2.5 py-1 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 附加條件（可複選） */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    附加條件（可複選）
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.specialRequirements.noCross}
                        onChange={(e) => updateSpecial({ noCross: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>請勿劃線</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.specialRequirements.noEndorse}
                        onChange={(e) => updateSpecial({ noEndorse: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>請勿禁止背書轉讓</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 大區塊 B：其他付款方式 */}
          <div
            className={`border rounded-lg transition-colors p-3.5 ${
              activeGroup === 'other'
                ? 'bg-white border-blue-300 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-slate-100/60 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="radio"
                name="paymentGroup"
                value="other"
                checked={activeGroup === 'other'}
                onChange={() => handleSelectGroup('other')}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
              />
              <span className="text-sm font-bold text-slate-800">其他付款方式</span>
            </label>

            {activeGroup === 'other' && (
              <div className="mt-3 pt-3 border-t border-slate-100 pl-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data.specialRequirements.wireTransfer}
                      onChange={(e) => updateSpecial({ wireTransfer: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>請以匯款支付</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data.specialRequirements.offsetBorrowing}
                      onChange={(e) => updateSpecial({ offsetBorrowing: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>請沖銷借支款</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 區塊五：請款說明 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-semibold text-slate-700">
            請款說明（逐行輸入或按 Enter 換行）
          </label>
          <span className={`text-xs ${isOverLimit ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
            目前：{lineCount} 行（Excel 母版建議上限 16 行）
          </span>
        </div>
        <textarea
          rows={7}
          placeholder={`會館3F室外機馬達、電容損壞維修。\n更換壓縮機零件及冷媒充填。\n附廠商保固證明書及出廠報告...`}
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono leading-relaxed"
        />

        {isOverLimit && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-bold">說明行數超出 Excel 單頁預留範圍（16 行）警告：</p>
              <p>
                為嚴格維持 Excel 列印於單張 A4 簽核格式不跑版，超出第 16 行的文字將合併折行收納於最後一列。建議您將內容精簡在 16 行以內，或產出 PDF 進行多頁完整列印。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
