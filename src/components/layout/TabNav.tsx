import React from 'react';
import { Stamp, Receipt, Database, FileText } from 'lucide-react';

export type FormTab = 'seal' | 'payment' | 'records' | 'master';

interface Props {
  activeTab: FormTab;
  onChange: (tab: FormTab) => void;
}

export const TabNav: React.FC<Props> = ({ activeTab, onChange }) => {
  return (
    <div className="sticky top-16 z-20 flex border-b border-slate-200 bg-white rounded-t-2xl px-2 sm:px-4 pt-2 sm:pt-2.5 overflow-x-auto overflow-y-hidden sm:overflow-x-visible flex-nowrap whitespace-nowrap scrollbar-none">
      <button
        type="button"
        onClick={() => onChange('seal')}
        className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 font-medium text-xs sm:text-sm transition-colors border-b-2 -mb-px flex-shrink-0 whitespace-nowrap ${
          activeTab === 'seal'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
        }`}
      >
        <Stamp className="w-4 h-4 flex-shrink-0" />
        <span>用印／簽呈</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('payment')}
        className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 font-medium text-xs sm:text-sm transition-colors border-b-2 -mb-px flex-shrink-0 whitespace-nowrap ${
          activeTab === 'payment'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
        }`}
      >
        <Receipt className="w-4 h-4 flex-shrink-0" />
        <span>請款單</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('records')}
        className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 font-medium text-xs sm:text-sm transition-colors border-b-2 -mb-px flex-shrink-0 whitespace-nowrap ${
          activeTab === 'records'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
        }`}
      >
        <FileText className="w-4 h-4 flex-shrink-0" />
        <span>表單紀錄</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('master')}
        className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 font-medium text-xs sm:text-sm transition-colors border-b-2 -mb-px flex-shrink-0 whitespace-nowrap ${
          activeTab === 'master'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
        }`}
      >
        <Database className="w-4 h-4 flex-shrink-0" />
        <span>主檔管理</span>
      </button>
    </div>
  );
};
