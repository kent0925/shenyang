import React from 'react';
import { PaymentRequestData } from '../../models/paymentRequest';
import { DEFAULT_COMPANIES } from '../../models/sealApproval';
import { AlertCircle, Calendar, DollarSign, Building2 } from 'lucide-react';
import { calculatePayableAmount, formatCurrency } from '../../utils/format';

interface Props {
  data: PaymentRequestData;
  onChange: (data: PaymentRequestData) => void;
  errors: Record<string, string>;
}

export const PaymentRequestForm: React.FC<Props> = ({ data, onChange, errors }) => {
  const updateBankAccount = (fields: Partial<PaymentRequestData['bankAccount']>) => {
    onChange({
      ...data,
      bankAccount: { ...data.bankAccount, ...fields },
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
          <span>受款人／廠商與匯款帳號 (N5, N7)</span>
          <span className="text-xs text-slate-500 font-normal">純前端本機結構化輸入</span>
        </h3>

        {/* 受款人/廠商 (N5) */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            受款人／廠商名稱 (N5) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="請輸入廠商全名或個人受款姓名"
            value={data.vendor}
            onChange={(e) => onChange({ ...data, vendor: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {errors.vendor && <p className="text-xs text-red-500 mt-1">{errors.vendor}</p>}
        </div>

        {/* 銀行帳號結構化輸入 (N7) */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
            <span>銀行識別方式：</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="bankType"
                checked={data.bankAccount.type === 'code'}
                onChange={() => updateBankAccount({ type: 'code' })}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>使用銀行代碼</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="bankType"
                checked={data.bankAccount.type === 'name'}
                onChange={() => updateBankAccount({ type: 'name' })}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>使用銀行全名</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {data.bankAccount.type === 'code' ? (
              <div>
                <label className="block text-xs text-slate-600 mb-1">銀行代碼（如 007）</label>
                <input
                  type="text"
                  placeholder="3碼代號"
                  value={data.bankAccount.bankCode}
                  onChange={(e) => updateBankAccount({ bankCode: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-600 mb-1">銀行全名</label>
                <input
                  type="text"
                  placeholder="例如：第一商業銀行"
                  value={data.bankAccount.bankName}
                  onChange={(e) => updateBankAccount({ bankName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-600 mb-1">分行（代碼或名稱）</label>
              <input
                type="text"
                placeholder="例如：城東分行 或 0144"
                value={data.bankAccount.branch}
                onChange={(e) => updateBankAccount({ branch: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">戶名</label>
              <input
                type="text"
                placeholder="受款帳戶戶名"
                value={data.bankAccount.accountName}
                onChange={(e) => updateBankAccount({ accountName: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">銀行帳號</label>
              <input
                type="text"
                placeholder="匯款帳號"
                value={data.bankAccount.accountNumber}
                onChange={(e) => updateBankAccount({ accountNumber: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
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
