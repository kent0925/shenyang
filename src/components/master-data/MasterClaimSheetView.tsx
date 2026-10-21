import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Search,
  Filter,
  Check,
  Copy,
  TableProperties,
  Printer,
} from 'lucide-react';
import { RAW_MASTER_CLAIM_CSV, parseCsvRows } from '../../data/masterClaimData';
import { downloadMasterClaimCsv, downloadMasterClaimExcel } from '../../generators/excel/masterClaimExcel';

export const MasterClaimSheetView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [activeSection, setActiveSection] = useState<'all' | 'historical' | 'summary2025' | 'year2026'>('all');
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // 解析母表全部資料
  const allRows = useMemo(() => {
    return parseCsvRows(RAW_MASTER_CLAIM_CSV);
  }, []);

  // 拆分母表三大部分：
  // 1. 歷月請款明細總表 (從 row 0 到 row 74)
  // 2. 2025年專案及付款總結 (從 row 75 到 row 90)
  // 3. 2026年請款總表 (從 row 91 到 最後)
  const { table1Rows, table2Rows, table3Rows } = useMemo(() => {
    let t2Start = -1;
    let t3Start = -1;

    for (let i = 0; i < allRows.length; i++) {
      const firstCell = (allRows[i][0] || '').trim();
      const secondCell = (allRows[i][1] || '').trim();

      if (firstCell.includes('2025年專案及付款總結') || (firstCell === '' && secondCell.includes('2025年專案及付款總結'))) {
        t2Start = i;
      }
      if (
        (allRows[i][0] === '公司' && (allRows[i][6] || '').includes('截至10月已付')) ||
        (allRows[i][0] === '公司' && (allRows[i][5] || '').includes('合約終止'))
      ) {
        t3Start = i;
      }
    }

    const t1 = allRows.slice(0, t2Start > 0 ? t2Start : 74);
    const t2 = t2Start > 0 ? allRows.slice(t2Start, t3Start > 0 ? t3Start : undefined) : [];
    const t3 = t3Start > 0 ? allRows.slice(t3Start) : [];

    return { table1Rows: t1, table2Rows: t2, table3Rows: t3 };
  }, [allRows]);

  // 第一張表之明細列（排除表頭 3 列與合計/備註列）
  const table1BodyRows = useMemo(() => {
    const totalIndex = table1Rows.findIndex(
      (r, idx) => idx >= 3 && ((r[0] || '').includes('合計') || (r[1] || '').includes('合計'))
    );
    if (totalIndex !== -1) {
      return {
        items: table1Rows.slice(3, totalIndex),
        totalRow: table1Rows[totalIndex],
        notes: table1Rows.slice(totalIndex + 1),
      };
    }
    return {
      items: table1Rows.slice(3),
      totalRow: null,
      notes: [],
    };
  }, [table1Rows]);

  // 第二張表之結構
  const table2Parsed = useMemo(() => {
    if (table2Rows.length === 0) return null;
    const title = table2Rows[0][0] || '2025年專案及付款總結';
    const header = table2Rows[1] || [];
    const items = table2Rows.slice(2).filter((r) => r.some((c) => c.trim() !== ''));
    return { title, header, items };
  }, [table2Rows]);

  // 第三張表之結構
  const table3Parsed = useMemo(() => {
    if (table3Rows.length < 2) return null;
    const headerRow1 = table3Rows[0] || [];
    const headerRow2 = table3Rows[1] || [];
    const totalIndex = table3Rows.findIndex(
      (r, idx) => idx >= 2 && ((r[0] || '').includes('合計') || (r[1] || '').includes('合計'))
    );
    const items =
      totalIndex !== -1 ? table3Rows.slice(2, totalIndex) : table3Rows.slice(2);
    const totalRow = totalIndex !== -1 ? table3Rows[totalIndex] : null;
    const notes = totalIndex !== -1 ? table3Rows.slice(totalIndex + 1) : [];

    return { headerRow1, headerRow2, items, totalRow, notes };
  }, [table3Rows]);

  // 格式化數字與文字呈現
  const renderCellContent = (text: string | undefined, isHeader = false) => {
    if (!text || text.trim() === '') return <span className="text-slate-300">-</span>;
    const trimmed = text.trim();
    if (trimmed === 'NaN') return <span className="text-slate-400">NaN</span>;

    // 換行支援
    const lines = text.split('\n');
    if (lines.length > 1) {
      return (
        <span className="inline-block whitespace-pre-line leading-tight">
          {lines.map((line, idx) => (
            <React.Fragment key={idx}>
              {line}
              {idx < lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </span>
      );
    }

    // 數值判斷（保留小數位與格式）
    const num = Number(trimmed);
    const isNumber = !isNaN(num) && trimmed !== '' && !trimmed.startsWith('09');
    if (isNumber && !isHeader) {
      if (num > 0 && num < 1 && trimmed.includes('.')) {
        return <span className="font-mono text-slate-700">{(num * 100).toFixed(1)}%</span>;
      }
      return <span className="font-mono">{num.toLocaleString('zh-TW')}</span>;
    }

    // 狀態特殊色
    if (['結案', '終止'].includes(trimmed)) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {trimmed}
        </span>
      );
    }
    if (['保留款', '實做實算', '估價中', '報價中'].includes(trimmed)) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          {trimmed}
        </span>
      );
    }

    return <span>{text}</span>;
  };

  // 判斷是否為本月新增項目（母表備註：藍色=本月新增項目）
  const isBlueItem = (row: string[]): boolean => {
    const itemText = (row[2] || '') + (row[3] || '') + (row[1] || '');
    return (
      itemText.includes('紗窗修繕') ||
      itemText.includes('展示品壓克力罩修繕') ||
      itemText.includes('信義之星') ||
      itemText.includes('浴缸換新') ||
      itemText.includes('浴缸追加') ||
      itemText.includes('吊車') ||
      itemText.includes('大掃除') ||
      itemText.includes('月度清潔') ||
      itemText.includes('土地過戶代書費') ||
      itemText.includes('除草')
    );
  };

  // 複製母表 CSV 原文
  const handleCopyCsv = () => {
    navigator.clipboard.writeText(RAW_MASTER_CLAIM_CSV);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 處理 Excel 下載
  const handleDownloadExcel = async () => {
    try {
      setIsDownloading(true);
      await downloadMasterClaimExcel();
    } catch (err) {
      console.error('下載 Excel 失敗:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // 公司過濾邏輯
  const matchesCompany = (rowCompany: string) => {
    if (selectedCompany === 'all') return true;
    return rowCompany.includes(selectedCompany);
  };

  return (
    <div className="space-y-6">
      {/* 頂部操作與導航工具列 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <TableProperties className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                每月及年度請款總表（母表）
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  母表 100% 格式同步
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                跨年度（2024～2026年）請款明細總表、2025專案付款總結與2026年度請款總表
              </p>
            </div>
          </div>

          {/* 下載與匯出按鈕區 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 transition shadow-sm"
              title="下載完整 Excel 活頁簿 (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isDownloading ? '產生 Excel 中...' : '下載母表 Excel (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={downloadMasterClaimCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 transition shadow-sm"
              title="下載母表原始 CSV 檔 (UTF-8 BOM)"
            >
              <Download className="w-4 h-4" />
              <span>下載母表 CSV</span>
            </button>

            <button
              type="button"
              onClick={handleCopyCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition"
              title="複製母表 CSV 原始資料"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '已複製' : '複製 CSV'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition"
              title="列印母表"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 快捷板塊切換標籤與搜尋 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                activeSection === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              一頁全覽 (全部區塊)
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('historical')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                activeSection === 'historical'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              1. 歷月請款明細總表 (2024-2026)
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('summary2025')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                activeSection === 'summary2025'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              2. 2025年專案及付款總結
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('year2026')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                activeSection === 'year2026'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              3. 2026年請款總表
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 公司過濾器 */}
            <div className="flex items-center gap-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="rounded-lg border border-slate-300 p-1.5 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">所有公司</option>
                <option value="昇陽">昇陽</option>
                <option value="金傳">金傳</option>
                <option value="紫雲">紫雲</option>
                <option value="頂邑">頂邑</option>
                <option value="聖堡">聖堡</option>
                <option value="博鉅">博鉅</option>
              </select>
            </div>

            {/* 文字搜尋 */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="過濾項目/廠商/說明..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                清除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 區塊 1: 歷月請款明細總表 (2024~2026)                         */}
      {/* ========================================================= */}
      {(activeSection === 'all' || activeSection === 'historical') && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-800">
                一、每月及年度請款明細總表（2024年12月 ～ 2026年6月）
              </span>
              <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                ＊藍色=本月新增項目
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              製表時間：20251224
            </div>
          </div>

          <div className="overflow-x-auto max-h-[680px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse border border-slate-300 whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 shadow-sm">
                {/* 表頭第 1 列 */}
                <tr className="border-b border-slate-300 text-center font-bold">
                  <th rowSpan={3} className="border border-slate-300 px-3 py-2 bg-slate-100 sticky left-0 z-20">公司</th>
                  <th rowSpan={3} className="border border-slate-300 px-3 py-2 bg-slate-100 sticky left-[64px] z-20">專案</th>
                  <th rowSpan={3} className="border border-slate-300 px-3 py-2 bg-slate-100">項目/合約</th>
                  <th rowSpan={3} className="border border-slate-300 px-3 py-2 bg-slate-100">廠商</th>
                  <th rowSpan={3} className="border border-slate-300 px-3 py-2 bg-slate-100 text-right">總預算</th>
                  <th rowSpan={3} className="border border-slate-300 px-3 py-2 bg-slate-100 text-right">預算</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-1 bg-amber-50 text-amber-900 leading-tight">截至2025<br />12月已付</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-1 bg-amber-50 text-amber-900">已付</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-1 bg-amber-50 text-amber-900">待付</th>
                  <th colSpan={1} className="border border-slate-300 px-3 py-1 bg-indigo-50 text-indigo-900">2024年</th>
                  <th colSpan={15} className="border border-slate-300 px-3 py-1 bg-blue-50 text-blue-900">2025年</th>
                  <th colSpan={6} className="border border-slate-300 px-3 py-1 bg-emerald-50 text-emerald-900">2026年</th>
                </tr>
                {/* 表頭第 2 列 (月份標記) */}
                <tr className="border-b border-slate-300 text-center font-semibold text-[11px]">
                  {/* 2024 */}
                  <th className="border border-slate-300 px-2.5 py-1 bg-indigo-50/60">12月</th>
                  {/* 2025 */}
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">1月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">2月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">3月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">4月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">5月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">6月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">7月</th>
                  <th className="border border-slate-300 px-3 py-1 bg-blue-100/60 text-blue-800">說明</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">8月</th>
                  <th className="border border-slate-300 px-3 py-1 bg-blue-100/60 text-blue-800">說明</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">9月</th>
                  <th className="border border-slate-300 px-3 py-1 bg-blue-100/60 text-blue-800">說明</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">10月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">11月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-blue-50/50">12月</th>
                  {/* 2026 */}
                  <th className="border border-slate-300 px-2 py-1 bg-emerald-50/50">1月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-emerald-50/50">2月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-emerald-50/50">3月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-emerald-50/50">4月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-emerald-50/50">5月</th>
                  <th className="border border-slate-300 px-2 py-1 bg-emerald-50/50">6月</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {table1BodyRows.items
                  .filter((row) => {
                    const rowCompany = row[0] || '';
                    if (!matchesCompany(rowCompany)) return false;
                    if (!searchTerm) return true;
                    return row.some((c) => c.toLowerCase().includes(searchTerm.toLowerCase()));
                  })
                  .map((row, rIdx) => {
                    const isNewItem = isBlueItem(row);
                    return (
                      <tr
                        key={rIdx}
                        className={`transition hover:bg-slate-50 ${
                          isNewItem ? 'bg-blue-50/60 font-medium text-blue-950' : ''
                        }`}
                      >
                        {/* 公司 (左側凍結) */}
                        <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800 bg-inherit sticky left-0 z-0">
                          {row[0] || ''}
                        </td>
                        {/* 專案 (左側凍結) */}
                        <td className="border border-slate-200 px-3 py-2 font-medium text-slate-800 bg-inherit sticky left-[64px] z-0">
                          {renderCellContent(row[1])}
                        </td>
                        {/* 項目/合約 */}
                        <td className="border border-slate-200 px-3 py-2 text-slate-900">
                          {renderCellContent(row[2])}
                        </td>
                        {/* 廠商 */}
                        <td className="border border-slate-200 px-3 py-2 text-slate-700">
                          {renderCellContent(row[3])}
                        </td>
                        {/* 總預算 */}
                        <td className="border border-slate-200 px-3 py-2 text-right">
                          {renderCellContent(row[4])}
                        </td>
                        {/* 預算 */}
                        <td className="border border-slate-200 px-3 py-2 text-right">
                          {renderCellContent(row[5])}
                        </td>
                        {/* 截至2025 12月已付 */}
                        <td className="border border-slate-200 px-3 py-2 text-right bg-amber-50/20">
                          {renderCellContent(row[6])}
                        </td>
                        {/* 已付 */}
                        <td className="border border-slate-200 px-3 py-2 text-center bg-amber-50/20">
                          {renderCellContent(row[7])}
                        </td>
                        {/* 待付 */}
                        <td className="border border-slate-200 px-3 py-2 text-right bg-amber-50/20 font-medium">
                          {renderCellContent(row[8])}
                        </td>
                        {/* 2024 12月 */}
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-indigo-50/20">
                          {renderCellContent(row[9])}
                        </td>
                        {/* 2025 1月 ~ 12月 (含 7, 8, 9 月說明) */}
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[10])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[11])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[12])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[13])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[14])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[15])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[16])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600 bg-blue-50/30">{renderCellContent(row[17])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[18])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600 bg-blue-50/30">{renderCellContent(row[19])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[20])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600 bg-blue-50/30">{renderCellContent(row[21])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[22])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[23])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono">{renderCellContent(row[24])}</td>
                        {/* 2026 1月 ~ 6月 */}
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-emerald-50/20">{renderCellContent(row[25])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-emerald-50/20">{renderCellContent(row[26])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-emerald-50/20">{renderCellContent(row[27])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-emerald-50/20">{renderCellContent(row[28])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-emerald-50/20">{renderCellContent(row[29])}</td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-mono bg-emerald-50/20">{renderCellContent(row[30])}</td>
                      </tr>
                    );
                  })}

                {/* 合計列 */}
                {table1BodyRows.totalRow && (
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td className="border border-slate-300 px-3 py-2 sticky left-0 bg-slate-100 z-10"></td>
                    <td className="border border-slate-300 px-3 py-2 sticky left-[64px] bg-slate-100 z-10 text-center">合計</td>
                    <td className="border border-slate-300 px-3 py-2" colSpan={2}></td>
                    {table1BodyRows.totalRow.slice(4).map((val, cIdx) => (
                      <td
                        key={cIdx}
                        className={`border border-slate-300 px-2 py-2 text-right font-mono ${
                          cIdx === 0 || cIdx === 1 ? 'font-bold' : ''
                        }`}
                      >
                        {renderCellContent(val)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 表尾說明 */}
          <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-100 border border-blue-300 rounded inline-block"></span>
              <span>藍色標記列：本月新增項目</span>
            </div>
            <span>製表時間：20251224</span>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 區塊 2: 2025年專案及付款總結                                */}
      {/* ========================================================= */}
      {(activeSection === 'all' || activeSection === 'summary2025') && table2Parsed && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="font-bold text-sm text-slate-800">
              二、{table2Parsed.title}
            </span>
            <span className="text-xs text-slate-500">
              專案預算、終止合約、已付款與未請款彙總
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse border border-slate-300 whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                <tr>
                  <th className="border border-slate-300 px-3 py-2">公司</th>
                  <th className="border border-slate-300 px-3 py-2">專案</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">總預算</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">合約終止</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">已付款</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">已付比例</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">未請款</th>
                  <th className="border border-slate-300 px-3 py-2">備註</th>
                  <th className="border border-slate-300 px-3 py-2 text-center bg-blue-50/50">關係企業</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {table2Parsed.items
                  .filter((row) => {
                    const rowCompany = row[0] || '';
                    if (!matchesCompany(rowCompany)) return false;
                    return true;
                  })
                  .map((row, rIdx) => {
                    const isTotal = (row[0] || '').includes('合計') || (row[1] || '').includes('合計');
                    return (
                      <tr
                        key={rIdx}
                        className={`hover:bg-slate-50 ${isTotal ? 'bg-slate-100 font-bold border-t-2 border-slate-300' : ''}`}
                      >
                        <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">{row[0] || ''}</td>
                        <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">{row[1] || ''}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono">{renderCellContent(row[2])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono text-rose-700">{renderCellContent(row[3])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono text-emerald-800 font-semibold">{renderCellContent(row[4])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center">{renderCellContent(row[5])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono text-amber-900">{renderCellContent(row[6])}</td>
                        <td className="border border-slate-200 px-3 py-2 text-slate-600 text-[11px] max-w-xs whitespace-normal">{row[7] || ''}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center font-medium text-blue-800 bg-blue-50/30">{row[9] || ''}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 區塊 3: 2026年請款總表                                      */}
      {/* ========================================================= */}
      {(activeSection === 'all' || activeSection === 'year2026') && table3Parsed && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-sm text-slate-800">
              三、2026年請款總表（1月 ～ 12月逐月執行與待付明細）
            </span>
            <span className="text-xs text-slate-500 font-mono">
              製表時間：20261005
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse border border-slate-300 whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 shadow-sm">
                {/* 第 1 列 */}
                <tr className="border-b border-slate-300 text-center font-bold">
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-slate-100 sticky left-0 z-20">公司</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-slate-100 sticky left-[64px] z-20">專案</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-slate-100">項目/合約</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-slate-100">廠商</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-slate-100 text-right">總預算</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-slate-100 text-right">合約終止</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-amber-50 text-amber-900 leading-tight">截至10月<br />已付</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-amber-50 text-amber-900">比例</th>
                  <th rowSpan={2} className="border border-slate-300 px-3 py-2 bg-amber-50 text-amber-900">待付</th>
                  <th colSpan={12} className="border border-slate-300 px-3 py-1 bg-blue-50 text-blue-900">2026年</th>
                </tr>
                {/* 第 2 列 */}
                <tr className="border-b border-slate-300 text-center font-semibold text-[11px] bg-blue-50/60">
                  <th className="border border-slate-300 px-2 py-1">1月</th>
                  <th className="border border-slate-300 px-2 py-1">2月</th>
                  <th className="border border-slate-300 px-2 py-1">3月</th>
                  <th className="border border-slate-300 px-2 py-1">4月</th>
                  <th className="border border-slate-300 px-2 py-1">5月</th>
                  <th className="border border-slate-300 px-2 py-1">6月</th>
                  <th className="border border-slate-300 px-2 py-1">7月</th>
                  <th className="border border-slate-300 px-2 py-1">8月</th>
                  <th className="border border-slate-300 px-2 py-1">9月</th>
                  <th className="border border-slate-300 px-2 py-1">10月</th>
                  <th className="border border-slate-300 px-2 py-1">11月</th>
                  <th className="border border-slate-300 px-2 py-1">12月</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {table3Parsed.items
                  .filter((row) => {
                    const rowCompany = row[0] || '';
                    if (!matchesCompany(rowCompany)) return false;
                    if (!searchTerm) return true;
                    return row.some((c) => c.toLowerCase().includes(searchTerm.toLowerCase()));
                  })
                  .map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 transition">
                      <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800 sticky left-0 bg-white z-0">{row[0] || ''}</td>
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900 sticky left-[64px] bg-white z-0">{row[1] || ''}</td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-900">{renderCellContent(row[2])}</td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">{renderCellContent(row[3])}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right">{renderCellContent(row[4])}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-mono text-rose-700">{renderCellContent(row[5])}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right bg-amber-50/20">{renderCellContent(row[6])}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center bg-amber-50/20">{renderCellContent(row[7])}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right font-semibold bg-amber-50/20">{renderCellContent(row[8])}</td>
                      {/* 2026年 1月~12月 */}
                      {row.slice(9, 21).map((val, cIdx) => (
                        <td key={cIdx} className="border border-slate-200 px-2.5 py-2 text-right font-mono">
                          {renderCellContent(val)}
                        </td>
                      ))}
                    </tr>
                  ))}

                {/* 合計列 */}
                {table3Parsed.totalRow && (
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td className="border border-slate-300 px-3 py-2 sticky left-0 bg-slate-100 z-10 text-center">合計</td>
                    <td className="border border-slate-300 px-3 py-2 sticky left-[64px] bg-slate-100 z-10"></td>
                    <td className="border border-slate-300 px-3 py-2" colSpan={2}></td>
                    {table3Parsed.totalRow.slice(4).map((val, cIdx) => (
                      <td key={cIdx} className="border border-slate-300 px-2 py-2 text-right font-mono">
                        {renderCellContent(val)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex justify-end text-xs text-slate-500 font-mono">
            製表時間：20261005
          </div>
        </div>
      )}
    </div>
  );
};
