import React from 'react';
import { DEFAULT_COMPANIES, SealApprovalData, SealApprovalType } from '../../models/sealApproval';
import { AlertCircle, Calendar, CheckSquare, Info } from 'lucide-react';

interface Props {
  data: SealApprovalData;
  onChange: (data: SealApprovalData) => void;
  errors: Record<string, string>;
}

export const SealApprovalForm: React.FC<Props> = ({ data, onChange, errors }) => {
  const handleTypeToggle = (type: SealApprovalType) => {
    const exists = data.types.includes(type);
    let newTypes: SealApprovalType[];
    if (exists) {
      newTypes = data.types.filter((t) => t !== type);
    } else {
      newTypes = [...data.types, type];
    }
    onChange({ ...data, types: newTypes });
  };

  const descLines = data.description ? data.description.split('\n') : [];
  const lineCount = descLines.length;
  const isOverLimit = lineCount > 17;

  return (
    <div className="space-y-6">
      {/* 基本欄位區 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 公司名稱 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            公司名稱 <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            <select
              value={DEFAULT_COMPANIES.includes(data.company) ? data.company : 'custom'}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  onChange({ ...data, company: '' });
                } else {
                  onChange({ ...data, company: e.target.value });
                }
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>
          {errors.company && <p className="text-xs text-red-500 mt-1">{errors.company}</p>}
        </div>

        {/* 申請日期 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            申請日期 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="date"
              value={data.applyDate}
              onChange={(e) => onChange({ ...data, applyDate: e.target.value })}
              className="w-full px-3 py-2 pl-9 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          </div>
          {errors.applyDate && <p className="text-xs text-red-500 mt-1">{errors.applyDate}</p>}
        </div>
      </div>

      {/* 申請類型（複選） */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          申請類型（可複選） <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap gap-4">
          {(['簽呈', '用印', '借印'] as SealApprovalType[]).map((t) => {
            const checked = data.types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeToggle(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  checked
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CheckSquare className={`w-4 h-4 ${checked ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{t}</span>
              </button>
            );
          })}
        </div>
        {errors.types && <p className="text-xs text-red-500 mt-1">{errors.types}</p>}
        <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          <span>若同時勾選簽呈+用印，下載檔名將標記為「簽呈+用印」。</span>
        </p>
      </div>

      {/* 主旨 */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          主旨 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="例如：紅淡山鑽探工程報價、辦公室租賃合約續約"
          value={data.subject}
          onChange={(e) => onChange({ ...data, subject: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {errors.subject && <p className="text-xs text-red-500 mt-1">{errors.subject}</p>}
      </div>

      {/* 說明 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-semibold text-slate-700">
            說明（逐行輸入或按 Enter 換行）
          </label>
          <span className={`text-xs ${isOverLimit ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
            目前：{lineCount} 行（Excel 母版建議上限 17 行）
          </span>
        </div>
        <textarea
          rows={8}
          placeholder={`1.鑽探工程依規劃共需鑽探16孔...\n2.另因山坡地開發需增做地質敏感區調查...\n3.本工程辦理比議價結果說明...`}
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono leading-relaxed"
        />

        {isOverLimit && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-bold">說明行數超出 Excel 單頁預留範圍（17 行）警告：</p>
              <p>
                為嚴格維持 Excel 列印於單張 A4 簽核格式不跑版，超出第 17 行的文字將合併折行收納於最後一列。建議您將內容精簡在 17 行以內，或產出 PDF 進行多頁完整列印。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
