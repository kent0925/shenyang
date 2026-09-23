import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  FolderKanban,
  FolderTree,
  Loader2,
  RefreshCw,
  Save,
  TableProperties,
} from 'lucide-react';
import { backendStorageService } from '../../services/backendStorage';
import type {
  AnnualBillingReport,
  BillingCycleRulePreview,
  BillingPeriod,
  BillingPeriodReport,
  SaveBillingCycleRulePayload,
} from '../../models/backend';
import { formatCurrency } from '../../utils/format';

const defaultRuleForm: SaveBillingCycleRulePayload = {
  cutoffDay: 20,
  submissionDay: 20,
  paymentMonthOffset: 1,
  paymentDay: 15,
  effectiveFrom: new Date().toISOString().slice(0, 10),
};

const readPayload = (payloadJson: string) => {
  try {
    return JSON.parse(payloadJson || '{}') as {
      budgetItemName?: string;
      applyDate?: string;
      actualPaymentDate?: string;
    };
  } catch {
    return {};
  }
};

interface Props {
  focusSection?: 'cycle' | 'summary';
}

export const BillingCyclesPanel: React.FC<Props> = ({ focusSection = 'cycle' }) => {
  // 總表子分頁：'monthly' (每月請款總表) | 'annual' (年度請款總表)
  const [summarySubTab, setSummarySubTab] = useState<'monthly' | 'annual'>('monthly');

  // 請款週期規則表單狀態
  const [ruleForm, setRuleForm] = useState<SaveBillingCycleRulePayload>(defaultRuleForm);
  const [preview, setPreview] = useState<BillingCycleRulePreview | null>(null);
  const [isSavingRule, setIsSavingRule] = useState(false);

  // 請款期別清單
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  // 每月請款總表資料狀態
  const [monthlyReport, setMonthlyReport] = useState<BillingPeriodReport | null>(null);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);

  // 年度請款總表資料狀態
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [annualReport, setAnnualReport] = useState<AnnualBillingReport | null>(null);
  const [isLoadingAnnual, setIsLoadingAnnual] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Record<number, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedSubProjects, setExpandedSubProjects] = useState<Record<string, boolean>>({});

  // 年度區間篩選狀態：'all' (全年度) | 'custom' (自訂期別區間)
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all');
  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);

  // 提示訊息
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // 1. 初始化載入期別清單
  const loadPeriods = useCallback(async () => {
    setErrorMessage('');
    try {
      const list = await backendStorageService.listBillingPeriods();
      setPeriods(list);
      if (list.length > 0) {
        setSelectedPeriodId((current) => current || list[0].billingPeriodId);
      }
    } catch (error: any) {
      setErrorMessage(error?.safeMessage || error?.message || '載入請款週期資料失敗');
    }
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  // 動態推導可選年度（由期別出處或當前年前後動態推導，不寫死）
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    const current = new Date().getFullYear();
    yearSet.add(current);
    yearSet.add(current - 1);
    yearSet.add(current + 1);

    periods.forEach((p) => {
      const y = Number(p.periodEnd.slice(0, 4));
      if (Number.isInteger(y) && y > 2000) yearSet.add(y);
      const startY = Number(p.periodStart.slice(0, 4));
      if (Number.isInteger(startY) && startY > 2000) yearSet.add(startY);
    });

    return Array.from(yearSet).sort((a, b) => b - a);
  }, [periods]);

  // 取得該年度有效期別月份清單（若該年度只有 4~10 月則提供 4~10 月；預設 1~12 月）
  const availablePeriodMonthsForYear = useMemo(() => {
    const months = new Set<number>();
    periods.forEach((p) => {
      const periodYear = Number(p.periodEnd.slice(0, 4));
      const pKeyYear = Number(p.claimPeriodKey.slice(0, 4));
      const m = Number(p.claimPeriodKey.slice(5, 7));
      if ((periodYear === selectedYear || pKeyYear === selectedYear) && Number.isInteger(m) && m >= 1 && m <= 12) {
        months.add(m);
      }
    });

    if (months.size === 0) {
      for (let i = 1; i <= 12; i++) months.add(i);
    }
    return Array.from(months).sort((a, b) => a - b);
  }, [periods, selectedYear]);

  // 當年度或有效月份改變時，校正自訂區間起始與結束月份預設值
  useEffect(() => {
    if (availablePeriodMonthsForYear.length > 0) {
      const minM = availablePeriodMonthsForYear[0];
      const maxM = availablePeriodMonthsForYear[availablePeriodMonthsForYear.length - 1];
      setStartMonth((prev) => (availablePeriodMonthsForYear.includes(prev) ? prev : minM));
      setEndMonth((prev) => (availablePeriodMonthsForYear.includes(prev) ? prev : maxM));
    }
  }, [availablePeriodMonthsForYear]);

  // 2. 預覽請款週期新規則
  const handlePreviewRule = async () => {
    setMessage('');
    setErrorMessage('');
    try {
      const prev = await backendStorageService.previewBillingCycleRule(ruleForm);
      setPreview(prev);
    } catch (error: any) {
      setPreview(null);
      setErrorMessage(error?.safeMessage || error?.message || '無法產生影響預覽');
    }
  };

  // 3. 儲存請款週期新規則
  const handleSaveRule = async () => {
    if (!preview) {
      setErrorMessage('請先點擊「預覽影響」確認規則後再儲存');
      return;
    }
    setIsSavingRule(true);
    setMessage('');
    setErrorMessage('');
    try {
      await backendStorageService.saveBillingCycleRule({
        ...ruleForm,
        confirmCoverageGap: preview.requiresCoverageConfirmation,
      });
      setMessage('新請款週期規則已成功建立！歷史已建立之期別與請款 Snapshot 永久保留不變。');
      setPreview(null);
      await loadPeriods();
    } catch (error: any) {
      setErrorMessage(error?.safeMessage || error?.message || '儲存請款週期規則失敗');
    } finally {
      setIsSavingRule(false);
    }
  };

  // 4. 載入每月請款總表
  const loadMonthlyReport = useCallback(
    async (targetPeriodId?: string) => {
      const periodId = targetPeriodId || selectedPeriodId;
      if (!periodId) return;
      const targetPeriod = periods.find((p) => p.billingPeriodId === periodId);
      if (!targetPeriod) return;

      setIsLoadingMonthly(true);
      setErrorMessage('');
      try {
        const year = Number(targetPeriod.periodEnd.slice(0, 4));
        const res = await backendStorageService.getBillingPeriodReport(periodId, year);
        setMonthlyReport(res);
      } catch (error: any) {
        setMonthlyReport(null);
        setErrorMessage(error?.safeMessage || error?.message || '載入每月請款總表失敗');
      } finally {
        setIsLoadingMonthly(false);
      }
    },
    [periods, selectedPeriodId]
  );

  // 當選中特定期別時自動載入每月總表
  useEffect(() => {
    if (focusSection === 'summary' && summarySubTab === 'monthly' && selectedPeriodId) {
      loadMonthlyReport(selectedPeriodId);
    }
  }, [focusSection, summarySubTab, selectedPeriodId, loadMonthlyReport]);

  // 5. 載入年度請款總表（支援自訂月份期別區間）
  const loadAnnualReport = useCallback(
    async (
      year: number,
      mode: 'all' | 'custom' = rangeMode,
      sMonth: number = startMonth,
      eMonth: number = endMonth
    ) => {
      if (mode === 'custom' && sMonth > eMonth) {
        setErrorMessage('開始期別不得晚於結束期別。');
        return;
      }
      setIsLoadingAnnual(true);
      setErrorMessage('');
      try {
        const options = mode === 'custom' ? { startMonth: sMonth, endMonth: eMonth } : undefined;
        const res = await backendStorageService.getAnnualBillingReport(year, options);
        setAnnualReport(res);
      } catch (error: any) {
        setAnnualReport(null);
        setErrorMessage(error?.safeMessage || error?.message || '載入年度請款總表失敗');
      } finally {
        setIsLoadingAnnual(false);
      }
    },
    [rangeMode, startMonth, endMonth]
  );

  // 當切換到年度總表或更換年度時自動載入
  useEffect(() => {
    if (focusSection === 'summary' && summarySubTab === 'annual') {
      loadAnnualReport(selectedYear, rangeMode, startMonth, endMonth);
    }
  }, [focusSection, summarySubTab, selectedYear, loadAnnualReport, rangeMode, startMonth, endMonth]);

  // 切換月份展開
  const toggleMonth = (month: number) => {
    setExpandedMonths((prev) => ({ ...prev, [month]: !prev[month] }));
  };

  // 切換專案展開
  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // 切換分案展開
  const toggleSubProject = (subProjectId: string) => {
    setExpandedSubProjects((prev) => ({ ...prev, [subProjectId]: !prev[subProjectId] }));
  };

  // 檢查年度總額與各月加總是否精確一致
  const annualTotalMatchesMonths = useMemo(() => {
    if (!annualReport) return false;
    const sum = annualReport.monthlySummaries.reduce((acc, m) => acc + (m.totalAmount || 0), 0);
    return Math.abs(sum - annualReport.totalAmount) < 0.001;
  }, [annualReport]);

  return (
    <div className="space-y-6">
      {/* 訊息提示 */}
      {message && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 區塊 1: 請款週期設定 */}
      {focusSection === 'cycle' && (
        <section id="claim-cycle-section" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
              <CalendarDays className="w-5 h-5 text-blue-700" />
              請款週期設定
            </h3>
            <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              歷史期別 Snapshot 永久鎖定
            </span>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            系統支援自訂請款結算日、送件截止日與預定付款日。新設定以生效日版本化管理；已產生之歷史期別與請款 Snapshot
            絕不受新設定影響。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            <label className="text-xs font-semibold text-slate-700">
              結算截止日 (cutoffDay)
              <input
                type="number"
                min="1"
                max="28"
                value={ruleForm.cutoffDay ?? 20}
                onChange={(e) => setRuleForm({ ...ruleForm, cutoffDay: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">預設 20 日（上月 21 ～ 本月 20）</span>
            </label>

            <label className="text-xs font-semibold text-slate-700">
              送件截止日
              <input
                type="number"
                min="1"
                max="28"
                value={ruleForm.submissionDay}
                onChange={(e) => setRuleForm({ ...ruleForm, submissionDay: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">預設 20 日</span>
            </label>

            <label className="text-xs font-semibold text-slate-700">
              付款月份
              <select
                value={ruleForm.paymentMonthOffset}
                onChange={(e) => setRuleForm({ ...ruleForm, paymentMonthOffset: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={0}>當月</option>
                <option value={1}>次月 (預設)</option>
              </select>
              <span className="text-[11px] text-slate-400 mt-0.5 block">相對於請款月份</span>
            </label>

            <label className="text-xs font-semibold text-slate-700">
              付款日
              <input
                type="number"
                min="1"
                max="28"
                value={ruleForm.paymentDay}
                onChange={(e) => setRuleForm({ ...ruleForm, paymentDay: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">預設 15 日</span>
            </label>

            <label className="text-xs font-semibold text-slate-700">
              新規則生效日
              <input
                type="date"
                value={ruleForm.effectiveFrom}
                onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">新請款單將套用新規則</span>
            </label>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700">請款週期規則說明：</p>
            <p>
              • 預設請款週期為：上月 {(ruleForm.cutoffDay || 20) + 1} 日 ～ 本月 {ruleForm.cutoffDay || 20} 日。
            </p>
            <p>
              • 例如 2026/09/20 屬於 9 月請款（2026/08/21～2026/09/20）；2026/09/21 屬於 10 月請款（2026/09/21～2026/10/20）。
            </p>
            <p>
              • 跨年判定：2025/12/21～2026/01/20 屬於 2026 年 1 月請款，歸屬於 2026 年度。
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handlePreviewRule}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
            >
              預覽影響
            </button>
            <button
              type="button"
              disabled={!preview || isSavingRule}
              onClick={handleSaveRule}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition shadow-sm"
            >
              {isSavingRule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>儲存新規則</span>
            </button>
          </div>

          {preview && (
            <div className="mt-4 rounded-xl bg-blue-50/80 border border-blue-200 p-4 text-sm text-slate-800 space-y-2">
              <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                <span>新期別規則預覽結果</span>
              </div>
              <p>
                <b>期別名稱：</b> {preview.proposed.periodName}（{preview.proposed.periodStart} ～{' '}
                {preview.proposed.periodEnd}）
              </p>
              <p>
                <b>送件截止日：</b> {preview.proposed.submissionDate}；<b>預計付款日：</b>{' '}
                {preview.proposed.expectedPaymentDate}
              </p>
              <p className="text-xs text-slate-500">
                註：歷史已建立之期別與現有請款資料皆已固化 Snapshot，絕不會受到重新計算。
              </p>
              {preview.requiresCoverageConfirmation && (
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{preview.coverageWarning}（點選「儲存新規則」即代表同意確認此變動）。</span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 區塊 2: 請款總表（整合「每月請款總表」與「年度請款總表」） */}
      {focusSection === 'summary' && (
        <section id="claim-summary-section" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
          {/* 總表子分頁切換 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <TableProperties className="w-5 h-5 text-blue-700" />
              <h3 className="font-bold text-slate-900 text-base">請款總表中心</h3>
            </div>
            <div className="flex items-center bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setSummarySubTab('monthly')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  summarySubTab === 'monthly'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                每月請款總表
              </button>
              <button
                type="button"
                onClick={() => setSummarySubTab('annual')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  summarySubTab === 'annual'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                年度請款總表
              </button>
            </div>
          </div>

          {/* 子分頁 A: 每月請款總表 */}
          {summarySubTab === 'monthly' && (
            <div className="space-y-4">
              {/* 期別選擇列 */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 flex-1">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <label className="text-xs font-semibold text-slate-700 shrink-0">請款期別：</label>
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => {
                      setSelectedPeriodId(e.target.value);
                      loadMonthlyReport(e.target.value);
                    }}
                    className="flex-1 rounded-md border border-slate-300 p-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- 請選擇期別 --</option>
                    {periods.map((item) => (
                      <option key={item.billingPeriodId} value={item.billingPeriodId}>
                        {item.periodName}（{item.periodStart} ～ {item.periodEnd}）
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => loadMonthlyReport(selectedPeriodId)}
                  disabled={!selectedPeriodId || isLoadingMonthly}
                  className="px-4 py-1.5 bg-slate-800 text-white rounded-md text-xs font-medium hover:bg-slate-900 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMonthly ? 'animate-spin' : ''}`} />
                  <span>重新整理</span>
                </button>
              </div>

              {isLoadingMonthly ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                  <p className="text-sm">載入本期請款總表資料中...</p>
                </div>
              ) : monthlyReport ? (
                <div className="space-y-5">
                  {/* 期別資訊與金額統計卡片 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
                      <span className="text-xs text-blue-700 font-medium">本期請款總額</span>
                      <p className="font-bold text-lg text-blue-950 mt-1 font-mono">
                        NT$ {formatCurrency(monthlyReport.totalAmount)}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <span className="text-xs text-slate-600 font-medium">有效請款筆數</span>
                      <p className="font-bold text-lg text-slate-900 mt-1 font-mono">
                        {monthlyReport.claimCount} 筆
                      </p>
                    </div>
                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5">
                      <span className="text-xs text-emerald-700 font-medium">已付款總額</span>
                      <p className="font-bold text-lg text-emerald-900 mt-1 font-mono">
                        NT$ {formatCurrency(monthlyReport.paidAmount || 0)}
                      </p>
                    </div>
                    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
                      <span className="text-xs text-amber-700 font-medium">待付款／未付金額</span>
                      <p className="font-bold text-lg text-amber-900 mt-1 font-mono">
                        NT$ {formatCurrency(monthlyReport.unpaidAmount || 0)}
                      </p>
                    </div>
                  </div>

                  {/* 期別時程提示 */}
                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span>週期區間：</span>
                      <b className="text-slate-700 font-mono">
                        {monthlyReport.period.periodStart} ～ {monthlyReport.period.periodEnd}
                      </b>
                    </div>
                    <div>
                      <span>送件截止：</span>
                      <b className="text-slate-700 font-mono">{monthlyReport.period.submissionDate}</b>
                    </div>
                    <div>
                      <span>預定付款日：</span>
                      <b className="text-slate-700 font-mono">{monthlyReport.period.expectedPaymentDate}</b>
                    </div>
                  </div>

                  {/* 請款明細清單表格 */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">請款明細清單</span>
                      <span className="text-xs text-slate-500 font-mono">共 {monthlyReport.rows.length} 筆</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100/75 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">專案名稱</th>
                            <th className="py-2.5 px-3">所屬分案</th>
                            <th className="py-2.5 px-3">預算項目</th>
                            <th className="py-2.5 px-3">廠商名稱</th>
                            <th className="py-2.5 px-3">請款日期</th>
                            <th className="py-2.5 px-3 text-right">金額 (NT$)</th>
                            <th className="py-2.5 px-3 text-center">狀態</th>
                            <th className="py-2.5 px-3 text-center">實際付款日</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {monthlyReport.rows.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-slate-400">
                                本期別目前尚無請款資料
                              </td>
                            </tr>
                          ) : (
                            monthlyReport.rows.map((row) => {
                              const payload = readPayload(row.payloadJson);
                              const isPaid = row.status === 'paid';
                              return (
                                <tr key={row.formId} className="hover:bg-slate-50/80 transition">
                                  <td className="py-2 px-3 font-medium text-slate-900">{row.projectName}</td>
                                  <td className="py-2 px-3 text-slate-700">
                                    <span className="inline-flex items-center gap-1">
                                      <FolderTree className="w-3 h-3 text-blue-500" />
                                      <span>{row.subProjectName || '（未指定）'}</span>
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-slate-800">
                                    {payload.budgetItemName || row.budgetItemId}
                                  </td>
                                  <td className="py-2 px-3 text-slate-700">{row.vendorName}</td>
                                  <td className="py-2 px-3 font-mono text-slate-600">
                                    {payload.applyDate || row.createdAt?.slice(0, 10) || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                                    {formatCurrency(row.amount)}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        isPaid
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}
                                    >
                                      {row.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono text-slate-600">
                                    {payload.actualPaymentDate || '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 分類小計卡片群組 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                        <span>各專案小計</span>
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {monthlyReport.projectSubtotals.length === 0 ? (
                          <p className="text-xs text-slate-400">無資料</p>
                        ) : (
                          monthlyReport.projectSubtotals.map((item) => (
                            <div key={item.name} className="flex justify-between text-xs">
                              <span className="text-slate-600 truncate mr-2" title={item.name}>
                                {item.name}
                              </span>
                              <span className="font-mono font-medium text-slate-900 shrink-0">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                        <FolderTree className="w-3.5 h-3.5 text-blue-600" />
                        <span>各分案小計</span>
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {monthlyReport.subProjectSubtotals.length === 0 ? (
                          <p className="text-xs text-slate-400">無資料</p>
                        ) : (
                          monthlyReport.subProjectSubtotals.map((item) => (
                            <div key={item.name} className="flex justify-between text-xs">
                              <span className="text-slate-600 truncate mr-2" title={item.name}>
                                {item.name}
                              </span>
                              <span className="font-mono font-medium text-slate-900 shrink-0">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5 text-blue-600" />
                        <span>各預算項目小計</span>
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {(monthlyReport.budgetItemSubtotals || []).length === 0 ? (
                          <p className="text-xs text-slate-400">無資料</p>
                        ) : (
                          (monthlyReport.budgetItemSubtotals || []).map((item) => (
                            <div key={item.name} className="flex justify-between text-xs">
                              <span className="text-slate-600 truncate mr-2" title={item.name}>
                                {item.name}
                              </span>
                              <span className="font-mono font-medium text-slate-900 shrink-0">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>各廠商小計</span>
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {monthlyReport.vendorSubtotals.length === 0 ? (
                          <p className="text-xs text-slate-400">無資料</p>
                        ) : (
                          monthlyReport.vendorSubtotals.map((item) => (
                            <div key={item.name} className="flex justify-between text-xs">
                              <span className="text-slate-600 truncate mr-2" title={item.name}>
                                {item.name}
                              </span>
                              <span className="font-mono font-medium text-slate-900 shrink-0">
                                {formatCurrency(item.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">請選擇期別以檢視請款總表</p>
                </div>
              )}
            </div>
          )}

          {/* 子分頁 B: 年度請款總表 */}
          {summarySubTab === 'annual' && (
            <div className="space-y-5">
              {/* 年度與統計範圍選擇列 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    {/* 年度選擇 */}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-500" />
                      <label className="text-xs font-semibold text-slate-700 shrink-0">年度：</label>
                      <select
                        value={selectedYear}
                        onChange={(e) => {
                          const y = Number(e.target.value);
                          setSelectedYear(y);
                          loadAnnualReport(y, rangeMode, startMonth, endMonth);
                        }}
                        className="rounded-md border border-slate-300 p-1.5 text-sm bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {availableYears.map((year) => (
                          <option key={year} value={year}>
                            {year} 年度
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 統計範圍選擇 */}
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                      <span className="text-slate-500">統計範圍：</span>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="annualRangeMode"
                          checked={rangeMode === 'all'}
                          onChange={() => {
                            setRangeMode('all');
                            setErrorMessage('');
                            loadAnnualReport(selectedYear, 'all');
                          }}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>全年度</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="annualRangeMode"
                          checked={rangeMode === 'custom'}
                          onChange={() => {
                            setRangeMode('custom');
                            setErrorMessage('');
                          }}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>自訂期別區間</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadAnnualReport(selectedYear, rangeMode, startMonth, endMonth)}
                    disabled={isLoadingAnnual || (rangeMode === 'custom' && startMonth > endMonth)}
                    className="px-4 py-1.5 bg-slate-800 text-white rounded-md text-xs font-medium hover:bg-slate-900 disabled:opacity-50 transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAnnual ? 'animate-spin' : ''}`} />
                    <span>重新整理</span>
                  </button>
                </div>

                {/* 自訂期別區間展開控制器 */}
                {rangeMode === 'custom' && (
                  <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">開始期別：</label>
                      <select
                        value={startMonth}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStartMonth(val);
                          if (val > endMonth) setErrorMessage('開始期別不得晚於結束期別。');
                          else setErrorMessage('');
                        }}
                        className="rounded-md border border-slate-300 p-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {availablePeriodMonthsForYear.map((m) => (
                          <option key={m} value={m}>
                            {m} 月
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">結束期別：</label>
                      <select
                        value={endMonth}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setEndMonth(val);
                          if (startMonth > val) setErrorMessage('開始期別不得晚於結束期別。');
                          else setErrorMessage('');
                        }}
                        className="rounded-md border border-slate-300 p-1.5 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {availablePeriodMonthsForYear.map((m) => (
                          <option key={m} value={m}>
                            {m} 月
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => loadAnnualReport(selectedYear, 'custom', startMonth, endMonth)}
                      disabled={isLoadingAnnual || startMonth > endMonth}
                      className="px-4 py-1.5 bg-blue-700 text-white rounded-md text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 transition shadow-sm"
                    >
                      查看總表
                    </button>

                    {startMonth > endMonth && (
                      <span className="text-xs text-rose-600 font-medium">開始期別不得晚於結束期別。</span>
                    )}
                  </div>
                )}
              </div>

              {isLoadingAnnual ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                  <p className="text-sm">彙總所選請款期別數據中...</p>
                </div>
              ) : annualReport ? (
                <div className="space-y-6">
                  {/* 年度關鍵指標卡片 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
                      <span className="text-xs text-blue-700 font-medium">
                        {annualReport.year} 年{' '}
                        {annualReport.startMonth && annualReport.endMonth && (annualReport.startMonth !== 1 || annualReport.endMonth !== 12)
                          ? `${annualReport.startMonth}~${annualReport.endMonth} 月`
                          : '全年度'}{' '}
                        請款總額
                      </span>
                      <p className="font-bold text-xl text-blue-950 mt-1 font-mono">
                        NT$ {formatCurrency(annualReport.totalAmount)}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <span className="text-xs text-slate-600 font-medium">區間請款筆數</span>
                      <p className="font-bold text-xl text-slate-900 mt-1 font-mono">
                        {annualReport.claimCount} 筆
                      </p>
                    </div>
                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5">
                      <span className="text-xs text-emerald-700 font-medium">已付款總額</span>
                      <p className="font-bold text-xl text-emerald-900 mt-1 font-mono">
                        NT$ {formatCurrency(annualReport.paidAmount || 0)}
                      </p>
                    </div>
                    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
                      <span className="text-xs text-amber-700 font-medium">待付款／未付金額</span>
                      <p className="font-bold text-xl text-amber-900 mt-1 font-mono">
                        NT$ {formatCurrency(annualReport.unpaidAmount || 0)}
                      </p>
                    </div>
                  </div>

                  {/* 一致性防呆驗證提示 */}
                  {annualTotalMatchesMonths && (
                    <div className="flex items-center gap-2 p-2.5 bg-emerald-50/80 border border-emerald-200 text-emerald-800 rounded-lg text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        資料一致性校驗通過：{annualReport.year} 年{' '}
                        {annualReport.startMonth && annualReport.endMonth && (annualReport.startMonth !== 1 || annualReport.endMonth !== 12)
                          ? `${annualReport.startMonth}~${annualReport.endMonth} 月區間`
                          : '全年度'}{' '}
                        請款總額（NT$ {formatCurrency(annualReport.totalAmount)}）嚴格等於選取期別各月之和。
                      </span>
                    </div>
                  )}

                  {/* 月份列表（支援展開明細，只顯示選取區間的月份） */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        {annualReport.year} 年{' '}
                        {annualReport.startMonth && annualReport.endMonth && (annualReport.startMonth !== 1 || annualReport.endMonth !== 12)
                          ? `${annualReport.startMonth}~${annualReport.endMonth} 月`
                          : '1~12 月'}{' '}
                        各期請款匯總（支援展開明細）
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        共 {annualReport.monthlySummaries.length} 期
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {annualReport.monthlySummaries.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6">選取區間內無期別資料</p>
                      ) : (
                        annualReport.monthlySummaries.map((month) => {
                          const isExpanded = !!expandedMonths[month.month];
                          const rows = month.rows || [];
                          return (
                            <div key={month.claimPeriodKey} className="transition-colors">
                              <div
                                onClick={() => toggleMonth(month.month)}
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 text-xs select-none"
                              >
                                <div className="flex items-center gap-3">
                                  <button type="button" className="text-slate-400 hover:text-slate-600">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                  <span className="font-bold text-slate-900 text-sm">
                                    {month.month} 月份（{month.periodName}）
                                  </span>
                                  <span className="text-slate-500 font-mono hidden sm:inline">
                                    {month.periodStart} ～ {month.periodEnd}
                                  </span>
                                </div>

                                <div className="flex items-center gap-6 text-right">
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">筆數</span>
                                    <span className="font-mono text-slate-700">{month.claimCount} 筆</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">已付 / 待付</span>
                                    <span className="font-mono text-slate-600">
                                      {formatCurrency(month.paidAmount)} / {formatCurrency(month.unpaidAmount)}
                                    </span>
                                  </div>
                                  <div className="min-w-[100px]">
                                    <span className="text-slate-400 block text-[10px]">本期總額</span>
                                    <span className="font-mono font-bold text-slate-900 text-sm">
                                      NT$ {formatCurrency(month.totalAmount)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* 展開之該月份請款單明細 */}
                              {isExpanded && (
                                <div className="bg-slate-50/70 p-4 border-t border-slate-100">
                                  {rows.length === 0 ? (
                                    <p className="text-xs text-slate-400 text-center py-2">
                                      該月份期別尚無任何請款紀錄
                                    </p>
                                  ) : (
                                    <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                                      <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200">
                                          <tr>
                                            <th className="p-2">專案／分案</th>
                                            <th className="p-2">預算項目</th>
                                            <th className="p-2">廠商</th>
                                            <th className="p-2">請款日期</th>
                                            <th className="p-2 text-right">金額 (NT$)</th>
                                            <th className="p-2 text-center">狀態</th>
                                            <th className="p-2 text-center">實際付款日</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {rows.map((row) => {
                                            const payload = readPayload(row.payloadJson);
                                            return (
                                              <tr key={row.formId} className="hover:bg-slate-50/50">
                                                <td className="p-2 font-medium text-slate-900">
                                                  {row.projectName}
                                                  <span className="text-slate-400">／</span>
                                                  <span className="text-blue-700">{row.subProjectName || '未指定'}</span>
                                                </td>
                                                <td className="p-2 text-slate-800">
                                                  {payload.budgetItemName || row.budgetItemId}
                                                </td>
                                                <td className="p-2 text-slate-700">{row.vendorName}</td>
                                                <td className="p-2 font-mono text-slate-500">
                                                  {payload.applyDate || row.createdAt?.slice(0, 10) || '-'}
                                                </td>
                                                <td className="p-2 text-right font-mono font-semibold text-slate-900">
                                                  {formatCurrency(row.amount)}
                                                </td>
                                                <td className="p-2 text-center">
                                                  <span
                                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                                                      row.status === 'paid'
                                                        ? 'bg-emerald-50 text-emerald-700'
                                                        : 'bg-amber-50 text-amber-700'
                                                    }`}
                                                  >
                                                    {row.status}
                                                  </span>
                                                </td>
                                                <td className="p-2 text-center font-mono text-slate-500">
                                                  {payload.actualPaymentDate || '-'}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Project → SubProject → BudgetItem 階層 Drill-Down 檢視 */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        專案 → 分案 → 預算項目階層穿透檢視 (Drill-Down)
                      </span>
                      <span className="text-xs text-slate-500">點選展開階層明細</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {annualReport.projectHierarchy.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6">選取區間內尚無專案請款資料</p>
                      ) : (
                        annualReport.projectHierarchy.map((proj) => {
                          const isProjExpanded = !!expandedProjects[proj.id];
                          return (
                            <div key={proj.id} className="text-xs">
                              {/* 專案層級 */}
                              <div
                                onClick={() => toggleProject(proj.id)}
                                className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 select-none bg-white font-medium"
                              >
                                <div className="flex items-center gap-2">
                                  <button type="button" className="text-slate-400">
                                    {isProjExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                  <FolderKanban className="w-4 h-4 text-blue-600 shrink-0" />
                                  <span className="text-slate-900 font-bold">{proj.name}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-mono font-bold text-slate-900 min-w-[90px] text-right">
                                    NT$ {formatCurrency(proj.amount)}
                                  </span>
                                </div>
                              </div>

                              {/* 分案層級 (SubProjects) */}
                              {isProjExpanded && (
                                <div className="pl-8 bg-slate-50/50 divide-y divide-slate-100 border-t border-slate-100">
                                  {proj.subProjects.map((sub) => {
                                    const isSubExpanded = !!expandedSubProjects[sub.id];
                                    return (
                                      <div key={sub.id}>
                                        <div
                                          onClick={() => toggleSubProject(sub.id)}
                                          className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-blue-50/50 select-none"
                                        >
                                          <div className="flex items-center gap-2">
                                            <button type="button" className="text-slate-400">
                                              {isSubExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                              ) : (
                                                <ChevronRight className="w-3.5 h-3.5" />
                                              )}
                                            </button>
                                            <FolderTree className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            <span className="text-slate-800 font-semibold">{sub.name}</span>
                                          </div>
                                          <div className="flex items-center gap-4">
                                            <span className="font-mono font-semibold text-blue-900 min-w-[90px] text-right">
                                              NT$ {formatCurrency(sub.amount)}
                                            </span>
                                          </div>
                                        </div>

                                        {/* 預算項目層級 (BudgetItems) */}
                                        {isSubExpanded && (
                                          <div className="pl-8 pr-4 py-2 bg-white space-y-1.5 border-t border-slate-100">
                                            {sub.budgetItems.map((item) => (
                                              <div
                                                key={item.id}
                                                className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-50 text-[11px]"
                                              >
                                                <div className="flex items-center gap-1.5 text-slate-700">
                                                  <Coins className="w-3 h-3 text-slate-400 shrink-0" />
                                                  <span>{item.name}</span>
                                                  <span className="font-mono text-slate-400">({item.id})</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                  <span className="font-mono font-medium text-slate-800 min-w-[80px] text-right">
                                                    NT$ {formatCurrency(item.amount)}
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">請選擇年度以檢視年度請款總表</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
