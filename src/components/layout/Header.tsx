import React from 'react';
import { ShieldCheck, FileSpreadsheet } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center shadow">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">公司表單產生器</h1>
            <p className="text-xs text-slate-500">標準母版 Excel (XLSM/XLSX) 與 PDF 快速輸出工具</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-slate-700 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>資料後端同步</span>
          </div>
        </div>
      </div>
    </header>
  );
};
