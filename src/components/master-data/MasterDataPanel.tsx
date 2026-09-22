/**
 * src/components/master-data/MasterDataPanel.tsx - 主檔管理主要容器面板
 *
 * 核心規範：
 * 提供「專案主檔」與「廠商主檔」切換頁籤，作為統一之主檔管理入口。
 */

import React, { useState } from 'react';
import { ProjectsPanel } from './ProjectsPanel';
import { VendorsPanel } from './VendorsPanel';
import { BudgetItemsPanel } from './BudgetItemsPanel';
import { SubProjectsPanel } from './SubProjectsPanel';
import { BillingCyclesPanel } from './BillingCyclesPanel';
import { FolderKanban, Building2, Coins, FolderTree, CalendarDays } from 'lucide-react';

export type MasterDataTab = 'projects' | 'subprojects' | 'vendors' | 'budgets' | 'billing';

export const MasterDataPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MasterDataTab>('projects');

  return (
    <div className="space-y-6">
      {/* 內部子頁籤 (Segmented Control) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
        <div className="w-full sm:w-auto grid grid-cols-5 sm:flex sm:items-center gap-1 sm:gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'projects'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderKanban className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">專案主檔</span>
            <span className="sm:hidden inline">專案</span>
          </button>
          <button type="button" onClick={() => setActiveTab('billing')} className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${activeTab === 'billing' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><CalendarDays className="w-4 h-4" /><span className="hidden sm:inline">請款週期／總表</span><span className="sm:hidden">週期</span></button>

          <button type="button" onClick={() => setActiveTab('subprojects')} className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${activeTab === 'subprojects' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><FolderTree className="w-4 h-4" /><span className="hidden sm:inline">分案主檔</span><span className="sm:hidden">分案</span></button>

          <button
            type="button"
            onClick={() => setActiveTab('vendors')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'vendors'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">廠商主檔</span>
            <span className="sm:hidden inline">廠商</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('budgets')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'budgets'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Coins className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">預算項目</span>
            <span className="sm:hidden inline">預算</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 hidden sm:block">
          {activeTab === 'projects' && '管理公司所屬專案資料與運作狀態'}
          {activeTab === 'subprojects' && '管理主專案下的固定兩層分案資料'}
          {activeTab === 'vendors' && '維護常用受款廠商、統編與銀行匯款帳戶'}
          {activeTab === 'budgets' && '維護各年度專案預算編列、指定廠商與執行額度'}
          {activeTab === 'billing' && '維護請款規則版本並依已保存期別查看請款總表'}
        </div>
      </div>

      {/* 依分頁呈現內容 */}
      {activeTab === 'projects' && <ProjectsPanel />}
      {activeTab === 'subprojects' && <SubProjectsPanel />}
      {activeTab === 'vendors' && <VendorsPanel />}
      {activeTab === 'budgets' && <BudgetItemsPanel />}
      {activeTab === 'billing' && <BillingCyclesPanel />}
    </div>
  );
};
