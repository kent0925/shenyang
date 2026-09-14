import React, { useState, useEffect } from 'react';
import { PaymentRequestData } from '../../models/paymentRequest';
import { DEFAULT_COMPANIES } from '../../models/sealApproval';
import {
  AlertCircle,
  Calendar,
  DollarSign,
  Building2,
  Search,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Building,
  Landmark,
} from 'lucide-react';
import { calculatePayableAmount, formatCurrency } from '../../utils/format';
import { validateTaxId, lookupCompanyByTaxId } from '../../services/companyLookup';
import {
  loadBanks,
  findBankByCode,
  findBranchByCode,
  BankItem,
} from '../../services/bankLookup';

interface Props {
  data: PaymentRequestData;
  onChange: (data: PaymentRequestData) => void;
  errors: Record<string, string>;
}

export const PaymentRequestForm: React.FC<Props> = ({ data, onChange, errors }) => {
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [companySearchMsg, setCompanySearchMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    loadBanks()
      .then(setBanks)
      .catch((err) => {
        console.warn('載入金融機構資料失敗:', err);
      });
  }, []);

  const taxIdValue = (data.vendorTaxId || '').trim();
  const isTaxIdValid = validateTaxId(taxIdValue);

  const handleTaxIdLookup = async () => {
    if (!taxIdValue) {
      setCompanySearchMsg({ type: 'error', text: '請輸入統一編號' });
      return;
    }
    if (taxIdValue.length !== 8) {
      setCompanySearchMsg({ type: 'error', text: '請輸入完整 8 碼統一編號' });
      return;
    }
    if (!validateTaxId(taxIdValue)) {
      setCompanySearchMsg({ type: 'error', text: '統一編號檢核碼不符，請確認是否輸入正確' });
      return;
    }

    setIsSearchingCompany(true);
    setCompanySearchMsg(null);

    try {
      const result = await lookupCompanyByTaxId(taxIdValue);
      if (result && result.companyName) {
        const newVendor = result.companyName;
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
          text: `已自動帶入商工登記名稱：${newVendor}`,
        });
      } else {
        setCompanySearchMsg({
          type: 'info',
          text: '經濟部公開商工登記查無此統一編號，請手動輸入廠商名稱',
        });
      }
    } catch (err: any) {
      setCompanySearchMsg({
        type: 'error',
        text: err.message || '公司資料服務暫時無法使用，請稍後再試或手動輸入廠商名稱。',
      });
    } finally {
      setIsSearchingCompany(false);
    }
  };

  const handleVendorChange = (newVendor: string) => {
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
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          <span>基本與案件資訊</span>
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
                if (e.target.value === 'custom') {
                  onChange({ ...data, company: '' });
                } else {
                  onChange({ ...data, company: e.target.value });
                }
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

          {/* 專案代號/名稱 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              專案代號／名稱（選填）
            </label>
            <input
              type="text"
              placeholder="例如：台北A案（無專案時留空）"
              value={data.project}
              onChange={(e) => onChange({ ...data, project: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            />
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

          {/* 合約/訂購單編號 (I7) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              合約／訂購單編號 (I7)
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
      </div>

      {/* 區塊二：受款人與匯款資訊 (N5, N7) */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            <span>受款人／廠商與匯款帳號 (N5, N7)</span>
          </div>
          <span className="text-xs text-slate-500 font-normal">純前端本機結構化輸入</span>
        </h3>

        {/* 統一編號與受款人/廠商 (N5) */}
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
                    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                    onChange({ ...data, vendorTaxId: val });
                    if (companySearchMsg) setCompanySearchMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTaxIdLookup();
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={handleTaxIdLookup}
                  disabled={isSearchingCompany || taxIdValue.length !== 8}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSearchingCompany ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>查詢中</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>查詢公司</span>
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
                  <span>{companySearchMsg.text}</span>
                </p>
              )}
            </div>

            {/* 受款人/廠商名稱 (N5) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                受款人／廠商名稱 (N5) <span className="text-red-500">*</span>
              </label>
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

        {/* 銀行帳號結構化輸入 (N7) */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Landmark className="w-4 h-4 text-slate-600" />
              <span>匯款銀行與帳號明細 (N7)</span>
            </div>
            <span className="text-[11px] text-slate-400">依金管會金融機構代碼與分行資料庫雙向連動</span>
          </div>

          {/* 第一列：銀行代碼與銀行名稱 */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                銀行代碼（3 碼）
              </label>
              <input
                type="text"
                maxLength={3}
                placeholder="如 007"
                value={data.bankCode || ''}
                onChange={(e) => handleBankCodeChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="sm:col-span-8">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                銀行名稱（可下拉選取或由代碼自動帶入）
              </label>
              <select
                value={currentBank ? currentBank.code : ''}
                onChange={(e) => handleBankSelect(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- 請選擇或輸入銀行代碼 --</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 第二列：分行代碼與分行名稱 */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                分行代碼（4 碼）
              </label>
              <input
                type="text"
                maxLength={4}
                placeholder="如 1440"
                value={data.branchCode || ''}
                onChange={(e) => handleBranchCodeChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="sm:col-span-8">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                分行名稱（已依銀行篩選分支機構）
              </label>
              {currentBranches.length > 0 ? (
                <select
                  value={data.branchCode || ''}
                  onChange={(e) => handleBranchSelect(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- 請選擇分行 ({currentBranches.length} 家) --</option>
                  {currentBranches.map((br) => (
                    <option key={br.code} value={br.code}>
                      {br.code} {br.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="請先選擇銀行或手動輸入分行名稱"
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

          {/* 第三列：戶名與銀行帳號 */}
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
                銀行帳號（保留前置 0）
              </label>
              <input
                type="text"
                placeholder="匯款帳號（如 007123456789）"
                value={data.accountNumber || data.bankAccount?.accountNumber || ''}
                onChange={(e) => handleAccountNumberChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
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
              (5) 實付金額預覽（Excel 將以原生公式 =H13-I13-L13-N13 計算）：
            </span>
            <span className="text-base font-bold font-mono text-blue-700">
              NT$ {formatCurrency(payable)}
            </span>
          </div>
          {errors.currentAmount && <p className="text-xs text-red-500 mt-1">{errors.currentAmount}</p>}
        </div>
      </div>

      {/* 區塊四：特殊要求 */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-3">特殊要求（表單控制項勾選）</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.specialRequirements.cashiersCheck}
              onChange={(e) => updateSpecial({ cashiersCheck: e.target.checked })}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>請開立本票/台銀支票</span>
          </label>
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

        {/* 遠期支票附屬設定 */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <label className="flex items-center gap-2 cursor-pointer text-sm mb-2">
            <input
              type="checkbox"
              checked={data.specialRequirements.postDatedCheck}
              onChange={(e) => updateSpecial({ postDatedCheck: e.target.checked })}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>請付遠期支票予受款者</span>
          </label>

          {data.specialRequirements.postDatedCheck && (
            <div className="pl-6 flex items-center gap-2 text-xs text-slate-700">
              <span>指定兌現日期（Date Picker）：</span>
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
