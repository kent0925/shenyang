import React from 'react';
import { Stamp, Receipt } from 'lucide-react';

export type FormTab = 'seal' | 'payment';

interface Props {
  activeTab: FormTab;
  onChange: (tab: FormTab) => void;
}

export const TabNav: React.FC<Props> = ({ activeTab, onChange }) => {
  return (
    <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3">
      <button
        type="button"
        onClick={() => onChange('seal')}
        className={`flex items-center gap-2 px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px ${
          activeTab === 'seal'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
        }`}
      >
        <Stamp className="w-4 h-4" />
        <span>用印／簽呈</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('payment')}
        className={`flex items-center gap-2 px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px ${
          activeTab === 'payment'
            ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
            : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
        }`}
      >
        <Receipt className="w-4 h-4" />
        <span>請款單</span>
      </button>
    </div>
  );
};
