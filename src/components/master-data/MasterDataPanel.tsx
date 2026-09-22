/**
 * src/components/master-data/MasterDataPanel.tsx - 主檔管理主要容器面板
 *
 * 核心規範：
 * 依 App 所提供的 activeTab 顯示目前選中的主檔內容。
 */

import React from 'react';
import { ProjectsPanel } from './ProjectsPanel';
import { VendorsPanel } from './VendorsPanel';
import { BudgetItemsPanel } from './BudgetItemsPanel';
import { SubProjectsPanel } from './SubProjectsPanel';
export type MasterDataTab = 'projects' | 'subprojects' | 'budgets' | 'vendors';

interface Props {
  activeTab: MasterDataTab;
}

export const MasterDataPanel: React.FC<Props> = ({ activeTab }) => {
  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500 hidden sm:block">
          {activeTab === 'projects' && '管理公司所屬專案資料與運作狀態'}
          {activeTab === 'subprojects' && '管理主專案下的固定兩層分案資料'}
          {activeTab === 'vendors' && '維護常用受款廠商、統編與銀行匯款帳戶'}
          {activeTab === 'budgets' && '維護各年度專案預算編列、指定廠商與執行額度'}
      </div>

      {activeTab === 'projects' && <ProjectsPanel />}
      {activeTab === 'subprojects' && <SubProjectsPanel />}
      {activeTab === 'vendors' && <VendorsPanel />}
      {activeTab === 'budgets' && <BudgetItemsPanel />}
    </div>
  );
};
