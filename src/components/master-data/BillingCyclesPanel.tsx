import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, Loader2, Save, TableProperties } from 'lucide-react';
import { backendStorageService } from '../../services/backendStorage';
import type { BillingCycleRulePreview, BillingPeriod, BillingPeriodReport, SaveBillingCycleRulePayload } from '../../models/backend';
import { formatCurrency } from '../../utils/format';

const defaultForm: SaveBillingCycleRulePayload = {
  effectiveFrom: new Date().toISOString().slice(0, 10),
  submissionDay: 20,
  paymentMonthOffset: 1,
  paymentDay: 15,
};

const readPayload = (payloadJson: string) => {
  try { return JSON.parse(payloadJson || '{}') as { budgetItemName?: string; applyDate?: string }; }
  catch { return {}; }
};

interface Props {
  focusSection?: 'cycle' | 'summary';
}

export const BillingCyclesPanel: React.FC<Props> = ({ focusSection = 'cycle' }) => {
  const [form, setForm] = useState(defaultForm);
  const [preview, setPreview] = useState<BillingCycleRulePreview | null>(null);
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [report, setReport] = useState<BillingPeriodReport | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await backendStorageService.listBillingPeriods();
      setPeriods(list);
      setSelectedPeriodId((current) => current || list[0]?.billingPeriodId || '');
    } catch (error: any) {
      setMessage(error?.safeMessage || '載入請款週期資料失敗');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    document.getElementById(focusSection === 'cycle' ? 'claim-cycle-section' : 'claim-summary-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSection]);

  const previewRule = async () => {
    setMessage('');
    try {
      setPreview(await backendStorageService.previewBillingCycleRule(form));
    } catch (error: any) {
      setPreview(null);
      setMessage(error?.safeMessage || error?.message || '無法產生影響預覽');
    }
  };

  const save = async () => {
    if (!preview) { setMessage('請先預覽影響後再儲存'); return; }
    setIsSaving(true);
    setMessage('');
    try {
      await backendStorageService.saveBillingCycleRule({ ...form, confirmCoverageGap: preview.requiresCoverageConfirmation });
      setMessage('新規則已建立；既有期別與請款 Snapshot 不會變更。');
      setPreview(null);
      await load();
    } catch (error: any) {
      setMessage(error?.safeMessage || error?.message || '儲存規則失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPeriod = useMemo(() => periods.find((item) => item.billingPeriodId === selectedPeriodId), [periods, selectedPeriodId]);
  const subtotalGroups: Array<[string, Array<{ name: string; amount: number }>]> = report ? [
    ['各專案小計', report.projectSubtotals],
    ['各分案小計', report.subProjectSubtotals],
    ['各廠商小計', report.vendorSubtotals],
  ] : [];
  const loadReport = async () => {
    if (!selectedPeriodId || !selectedPeriod) return;
    setMessage('');
    try {
      setReport(await backendStorageService.getBillingPeriodReport(selectedPeriodId, Number(selectedPeriod.periodEnd.slice(0, 4))));
    } catch (error: any) {
      setReport(null);
      setMessage(error?.safeMessage || error?.message || '載入請款總表失敗');
    }
  };

  return <div className="space-y-6">
    <section id="claim-cycle-section" className="rounded-xl border border-slate-200 p-5 scroll-mt-28">
      <h3 className="font-bold text-slate-800 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-blue-700" />請款週期設定</h3>
      <p className="mt-1 text-sm text-slate-500">新規則以生效日建立版本；已建立期別與歷史請款均保留原 Snapshot。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <label className="text-xs font-medium text-slate-700">送件日<input type="number" min="1" max="28" value={form.submissionDay} onChange={(e) => setForm({ ...form, submissionDay: Number(e.target.value) })} className="mt-1 w-full rounded border p-2 text-sm" /></label>
        <label className="text-xs font-medium text-slate-700">付款月份<select value={form.paymentMonthOffset} onChange={(e) => setForm({ ...form, paymentMonthOffset: Number(e.target.value) })} className="mt-1 w-full rounded border p-2 text-sm"><option value={0}>本月</option><option value={1}>次月</option></select></label>
        <label className="text-xs font-medium text-slate-700">付款日<input type="number" min="1" max="28" value={form.paymentDay} onChange={(e) => setForm({ ...form, paymentDay: Number(e.target.value) })} className="mt-1 w-full rounded border p-2 text-sm" /></label>
        <label className="text-xs font-medium text-slate-700">新規則生效日<input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className="mt-1 w-full rounded border p-2 text-sm" /></label>
      </div>
      <p className="mt-3 text-sm text-slate-600">請款期別固定為當月 1 日至月底；送件與預定付款日依下列規則自動保存。</p>
      <div className="mt-4 flex gap-2"><button type="button" onClick={previewRule} className="px-4 py-2 border rounded-lg text-sm font-medium">預覽影響</button><button type="button" disabled={!preview || isSaving} onClick={save} className="inline-flex items-center gap-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />儲存</button></div>
      {preview && <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-slate-700"><p><b>新期別預覽：</b>{preview.proposed.periodName}（{preview.proposed.periodStart} ～ {preview.proposed.periodEnd}）</p><p>送件：{preview.proposed.submissionDate}；預計付款：{preview.proposed.expectedPaymentDate}</p><p>歷史已建立期別、已有請款與已付款資料均不變。</p>{preview.requiresCoverageConfirmation && <p className="mt-2 text-amber-700"><AlertCircle className="inline w-4 h-4 mr-1" />{preview.coverageWarning} 儲存即代表已確認。</p>}</div>}
      {message && <p className="mt-3 text-sm text-amber-700">{message}</p>}
    </section>

    <section id="claim-summary-section" className="rounded-xl border border-slate-200 p-5 scroll-mt-28">
      <h3 className="font-bold text-slate-800 flex items-center gap-2"><TableProperties className="w-5 h-5 text-blue-700" />每月請款總表</h3>
      <div className="mt-4 flex flex-col sm:flex-row gap-2"><select value={selectedPeriodId} onChange={(e) => { setSelectedPeriodId(e.target.value); setReport(null); }} className="flex-1 rounded border p-2 text-sm"><option value="">請選擇請款期別</option>{periods.map((item) => <option key={item.billingPeriodId} value={item.billingPeriodId}>{item.periodName}（{item.periodStart} ～ {item.periodEnd}）</option>)}</select><button type="button" onClick={loadReport} disabled={!selectedPeriodId} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm disabled:opacity-50">查看總表</button></div>
      {isLoading && <p className="mt-4 text-sm text-slate-500"><Loader2 className="inline w-4 h-4 animate-spin mr-1" />讀取中…</p>}
      {report && <div className="mt-5 space-y-4 text-sm"><div className="grid grid-cols-2 gap-3"><div className="rounded bg-slate-50 p-3"><span className="text-slate-500">本期請款總額</span><p className="font-bold text-lg">NT$ {formatCurrency(report.totalAmount)}</p></div><div className="rounded bg-slate-50 p-3"><span className="text-slate-500">有效請款筆數</span><p className="font-bold text-lg">{report.claimCount}</p></div></div><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50"><tr><th className="p-2">專案／分案／項目</th><th className="p-2">廠商</th><th className="p-2">請款日期</th><th className="p-2 text-right">金額</th><th className="p-2">狀態</th></tr></thead><tbody>{report.rows.map((row) => { const payload = readPayload(row.payloadJson); return <tr key={row.formId} className="border-t"><td className="p-2">{row.projectName}<span className="text-slate-400">／</span>{row.subProjectName}<span className="text-slate-400">／</span>{payload.budgetItemName || row.budgetItemId}</td><td className="p-2">{row.vendorName}</td><td className="p-2">{payload.applyDate || '-'}</td><td className="p-2 text-right">{formatCurrency(row.amount)}</td><td className="p-2">{row.status}</td></tr>; })}</tbody></table></div><p className="text-xs text-slate-500">送件日：{report.period.submissionDate}；預計付款日：{report.period.expectedPaymentDate}。目前資料模型沒有實際付款日欄位，故此欄保留空白。</p><div className="grid sm:grid-cols-3 gap-3">{subtotalGroups.map(([title, rows]) => <div key={title} className="rounded border p-3"><p className="font-semibold">{title}</p>{rows.map((item) => <p key={item.name} className="flex justify-between text-xs mt-1"><span>{item.name}</span><span>{formatCurrency(item.amount)}</span></p>)}</div>)}</div></div>}
    </section>
  </div>;
};
