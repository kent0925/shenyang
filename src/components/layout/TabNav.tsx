import React from 'react';
import {
  Building2,
  CalendarDays,
  Coins,
  Database,
  FileText,
  FolderKanban,
  FolderTree,
  Receipt,
  Stamp,
  TableProperties,
} from 'lucide-react';

export type FormTab = 'seal' | 'payment' | 'claims' | 'records' | 'master';
export type NavigationTarget =
  | { tab: 'seal' }
  | { tab: 'payment' }
  | { tab: 'records' }
  | { tab: 'claims'; section: 'cycle' | 'summary' }
  | { tab: 'master'; section: 'projects' | 'subprojects' | 'budgets' | 'vendors' };

interface Props {
  activeTab: FormTab;
  claimSection?: 'cycle' | 'summary';
  masterSection?: 'projects' | 'subprojects' | 'budgets' | 'vendors';
  onChange: (target: NavigationTarget) => void;
}

const topLevelClass = (active: boolean) => `flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 font-medium text-xs sm:text-sm transition-colors border-b-2 -mb-px flex-shrink-0 whitespace-nowrap ${
  active
    ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
}`;

const childClass = (active: boolean) => `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
  active ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
}`;

export const TabNav: React.FC<Props> = ({ activeTab, claimSection = 'cycle', masterSection = 'projects', onChange }) => {
  return (
    <div className="sticky top-16 z-20 flex items-stretch border-b border-slate-200 bg-white rounded-t-2xl px-2 sm:px-4 pt-2 sm:pt-2.5 overflow-x-auto overflow-y-hidden scrollbar-none">
      <button
        type="button"
        onClick={() => onChange({ tab: 'seal' })}
        className={topLevelClass(activeTab === 'seal')}
      >
        <Stamp className="w-4 h-4 flex-shrink-0" />
        <span>用印／簽呈</span>
      </button>

      <button
        type="button"
        onClick={() => onChange({ tab: 'payment' })}
        className={topLevelClass(activeTab === 'payment')}
      >
        <Receipt className="w-4 h-4 flex-shrink-0" />
        <span>請款單</span>
      </button>

      <div className={`flex flex-col flex-shrink-0 border-b-2 -mb-px ${activeTab === 'claims' ? 'border-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent'}`}>
        <button type="button" onClick={() => onChange({ tab: 'claims', section: 'cycle' })} className={topLevelClass(activeTab === 'claims')}>
          <Receipt className="w-4 h-4 flex-shrink-0" /><span>請款管理</span>
        </button>
        <div className="flex items-center gap-1 px-2 pb-1">
          <button type="button" onClick={() => onChange({ tab: 'claims', section: 'cycle' })} className={childClass(activeTab === 'claims' && claimSection === 'cycle')}><CalendarDays className="w-3.5 h-3.5" /><span>請款週期</span></button>
          <button type="button" onClick={() => onChange({ tab: 'claims', section: 'summary' })} className={childClass(activeTab === 'claims' && claimSection === 'summary')}><TableProperties className="w-3.5 h-3.5" /><span>請款總表</span></button>
        </div>
      </div>

      <button type="button" onClick={() => onChange({ tab: 'records' })} className={topLevelClass(activeTab === 'records')}>
        <FileText className="w-4 h-4 flex-shrink-0" /><span>表單紀錄</span>
      </button>

      <div className={`flex flex-col flex-shrink-0 border-b-2 -mb-px ${activeTab === 'master' ? 'border-blue-600 bg-blue-50/50 rounded-t-lg' : 'border-transparent'}`}>
        <button type="button" onClick={() => onChange({ tab: 'master', section: 'projects' })} className={topLevelClass(activeTab === 'master')}>
          <Database className="w-4 h-4 flex-shrink-0" /><span>主檔管理</span>
        </button>
        <div className="flex items-center gap-1 px-2 pb-1">
          <button type="button" onClick={() => onChange({ tab: 'master', section: 'projects' })} className={childClass(activeTab === 'master' && masterSection === 'projects')}><FolderKanban className="w-3.5 h-3.5" /><span>專案主檔</span></button>
          <button type="button" onClick={() => onChange({ tab: 'master', section: 'subprojects' })} className={childClass(activeTab === 'master' && masterSection === 'subprojects')}><FolderTree className="w-3.5 h-3.5" /><span>分案主檔</span></button>
          <button type="button" onClick={() => onChange({ tab: 'master', section: 'budgets' })} className={childClass(activeTab === 'master' && masterSection === 'budgets')}><Coins className="w-3.5 h-3.5" /><span>預算項目</span></button>
          <button type="button" onClick={() => onChange({ tab: 'master', section: 'vendors' })} className={childClass(activeTab === 'master' && masterSection === 'vendors')}><Building2 className="w-3.5 h-3.5" /><span>廠商主檔</span></button>
        </div>
      </div>
    </div>
  );
};
