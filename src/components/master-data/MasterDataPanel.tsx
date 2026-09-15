/**
 * src/components/master-data/MasterDataPanel.tsx - 主檔管理主要容器面板
 *
 * 核心規範：
 * 提供「專案主檔」與「廠商主檔」切換頁籤，作為統一之主檔管理入口。
 */

import React, { useState } from 'react';
import { ProjectsPanel } from './ProjectsPanel';
import { VendorsPanel } from './VendorsPanel';
import { FolderKanban, Building2 } from 'lucide-react';

export type MasterDataTab = 'projects' | 'vendors';

export const MasterDataPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MasterDataTab>('projects');

  return (
    <div className="space-y-6">
      {/* 內部子頁籤 (Segmented Control) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'projects'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>專案主檔</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vendors')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'vendors'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>廠商主檔</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 hidden sm:block">
          {activeTab === 'projects'
            ? '管理公司所屬專案資料與運作狀態'
            : '維護常用受款廠商、統編與銀行匯款帳戶'}
        </div>
      </div>

      {/* 依分頁呈現內容 */}
      {activeTab === 'projects' ? <ProjectsPanel /> : <VendorsPanel />}
    </div>
  );
};
