import React from 'react';
import { PaymentRequestData } from '../../models/paymentRequest';
import { parseDateParts } from '../../utils/date';
import { calculatePayableAmount, formatBankAccount, formatCurrency } from '../../utils/format';

interface Props {
  data: PaymentRequestData;
  id?: string;
}

export const PaymentRequestView: React.FC<Props> = ({ data, id = 'payment-request-view' }) => {
  const applyDateParts = parseDateParts(data.applyDate);
  const dueDateParts = parseDateParts(data.dueDate);
  const postDatedParts = parseDateParts(data.specialRequirements.postDatedDate);

  const payable = calculatePayableAmount(
    data.currentAmount,
    data.retentionAmount,
    data.advanceDeduction,
    data.penaltyDiscount
  );

  const formattedBank = formatBankAccount(data.bankAccount);
  const descLines = data.description ? data.description.split('\n') : [];
  const displayLinesCount = Math.max(descLines.length, 6);
  const displayLines: string[] = [];
  for (let i = 0; i < displayLinesCount; i++) {
    displayLines.push(descLines[i] || '');
  }

  const sr = data.specialRequirements;

  return (
    <div
      id={id}
      className="bg-white text-slate-900 p-6 max-w-[850px] mx-auto text-xs leading-tight border border-slate-300 shadow-sm print:border-none print:shadow-none font-sans"
      style={{ minHeight: '1100px' }}
    >
      {/* 抬頭與申請日 */}
      <div className="text-center mb-1">
        <h1 className="text-xl font-bold tracking-wider">{data.company || '公司名稱'}</h1>
        <h2 className="text-base font-bold tracking-widest mt-0.5">請　款　單</h2>
      </div>

      <div className="flex justify-end mb-1 text-xs">
        <div className="flex items-center gap-1 font-mono">
          <span>申請日：</span>
          <span className="border-b border-slate-700 min-w-[32px] text-center">{applyDateParts?.rocYear || ''}</span>
          <span>年</span>
          <span className="border-b border-slate-700 min-w-[24px] text-center">{applyDateParts?.month || ''}</span>
          <span>月</span>
          <span className="border-b border-slate-700 min-w-[24px] text-center">{applyDateParts?.day || ''}</span>
          <span>日</span>
        </div>
      </div>

      {/* 主表格 */}
      <table className="w-full border-collapse border-2 border-slate-800">
        <tbody>
          {/* 第 1 列：專案、請購單號、受款人、簽核 */}
          <tr className="border-b border-slate-800">
            <td className="w-24 bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">專案代號/名稱</td>
            <td className="w-32 p-1.5 border-r border-slate-800 font-medium">{data.project}</td>
            <td className="w-24 bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">請購單編號</td>
            <td className="w-32 p-1.5 border-r border-slate-800 font-mono">{data.requisitionNumber}</td>
            <td className="w-24 bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">受款人/廠商</td>
            <td className="p-1.5 border-r border-slate-800 font-medium">{data.vendor}</td>
            <td className="w-16 bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">申請部門</td>
            <td className="w-20 p-1.5 text-center">經辦</td>
          </tr>

          {/* 第 2 列：費用歸屬部門、合約號、受款人帳號、複核 */}
          <tr className="border-b border-slate-800">
            <td className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">費用歸屬部門</td>
            <td className="p-1.5 border-r border-slate-800">{data.department}</td>
            <td className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">合約/訂購單編號</td>
            <td className="p-1.5 border-r border-slate-800 font-mono">{data.contractNumber}</td>
            <td className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">受款人匯款帳號</td>
            <td className="p-1.5 border-r border-slate-800 font-mono whitespace-pre-wrap">{formattedBank}</td>
            <td colSpan={2} className="p-1.5 text-center border-slate-800 align-top">
              <div className="text-slate-500">複核</div>
            </td>
          </tr>

          {/* 第 3 列：費用性質、總額、到期日 */}
          <tr className="border-b-2 border-slate-800">
            <td className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">費用性質</td>
            <td className="p-1.5 border-r border-slate-800">{data.expenseNature}</td>
            <td className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">合約/訂購總額</td>
            <td className="p-1.5 border-r border-slate-800 font-mono text-right">{formatCurrency(data.contractTotal)}</td>
            <td className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">付款到期日</td>
            <td colSpan={3} className="p-1.5 font-mono">
              {dueDateParts ? `${dueDateParts.rocYear} 年 ${dueDateParts.month} 月 ${dueDateParts.day} 日` : ''}
            </td>
          </tr>

          {/* 付款明細標題 */}
          <tr className="bg-slate-100 font-bold text-center border-b border-slate-800">
            <td rowSpan={2} className="p-1.5 border-r border-slate-800 w-16">期次</td>
            <td className="p-1.5 border-r border-slate-800">(1)</td>
            <td className="p-1.5 border-r border-slate-800">(2)</td>
            <td className="p-1.5 border-r border-slate-800">(3)</td>
            <td className="p-1.5 border-r border-slate-800">(4)</td>
            <td colSpan={2} className="p-1.5 border-r border-slate-800">(5) = (1)-(2)-(3)-(4)</td>
            <td className="p-1.5 w-20">主管</td>
          </tr>
          <tr className="bg-slate-50 font-bold text-center border-b border-slate-800">
            <td className="p-1 border-r border-slate-800">請款/驗收/預付額</td>
            <td className="p-1 border-r border-slate-800">保留金額</td>
            <td className="p-1 border-r border-slate-800">預付款沖銷</td>
            <td className="p-1 border-r border-slate-800">罰扣(折讓金額)</td>
            <td colSpan={2} className="p-1 border-r border-slate-800">實付金額</td>
            <td rowSpan={3} className="p-1 border-slate-800"></td>
          </tr>

          {/* 付款明細本期金額 */}
          <tr className="border-b border-slate-800 text-center font-mono h-8">
            <td className="bg-slate-50 font-bold border-r border-slate-800">本期</td>
            <td className="p-1.5 border-r border-slate-800 text-right">{formatCurrency(data.currentAmount)}</td>
            <td className="p-1.5 border-r border-slate-800 text-right">{formatCurrency(data.retentionAmount)}</td>
            <td className="p-1.5 border-r border-slate-800 text-right">{formatCurrency(data.advanceDeduction)}</td>
            <td className="p-1.5 border-r border-slate-800 text-right">{formatCurrency(data.penaltyDiscount)}</td>
            <td colSpan={2} className="p-1.5 border-r border-slate-800 text-right font-bold text-blue-900 bg-blue-50/50">
              {formatCurrency(payable)}
            </td>
          </tr>

          {/* 累計請款列 */}
          <tr className="border-b-2 border-slate-800 text-center font-mono h-7 text-slate-500">
            <td className="bg-slate-50 font-bold border-r border-slate-800">累計</td>
            <td className="p-1 border-r border-slate-800"></td>
            <td className="p-1 border-r border-slate-800"></td>
            <td className="p-1 border-r border-slate-800"></td>
            <td className="p-1 border-r border-slate-800"></td>
            <td colSpan={2} className="p-1 border-r border-slate-800"></td>
          </tr>

          {/* 特殊要求 */}
          <tr className="border-b border-slate-800">
            <td rowSpan={2} className="bg-slate-100 font-bold p-1.5 text-center border-r border-slate-800">單據粘貼處</td>
            <td rowSpan={2} className="bg-slate-50 font-bold p-1.5 text-center border-r border-slate-800">特殊要求</td>
            <td colSpan={5} className="p-1.5 border-r border-slate-800">
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <label className="flex items-center gap-1"><span>{sr.noCross ? '☑' : '☐'}</span> 請勿劃線</label>
                <label className="flex items-center gap-1"><span>{sr.cashiersCheck ? '☑' : '☐'}</span> 請開本票/台銀支票</label>
                <label className="flex items-center gap-1"><span>{sr.wireTransfer ? '☑' : '☐'}</span> 請以匯款支付</label>
                <label className="flex items-center gap-1"><span>{sr.offsetBorrowing ? '☑' : '☐'}</span> 請沖銷借支款</label>
              </div>
            </td>
            <td rowSpan={2} className="p-1.5 text-center align-top border-slate-800">
              <div className="font-bold text-slate-600">財務部簽認</div>
            </td>
          </tr>
          <tr className="border-b-2 border-slate-800">
            <td colSpan={5} className="p-1.5 border-r border-slate-800 text-[11px]">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1"><span>{sr.noEndorse ? '☑' : '☐'}</span> 請勿禁止背書轉讓</label>
                <label className="flex items-center gap-1">
                  <span>{sr.postDatedCheck ? '☑' : '☐'}</span> 請付遠期支票，並於
                  <span className="font-mono underline px-1">{postDatedParts?.rocYear || '　'}</span>年
                  <span className="font-mono underline px-1">{postDatedParts?.month || '　'}</span>月
                  <span className="font-mono underline px-1">{postDatedParts?.day || '　'}</span>日付予支票
                </label>
              </div>
            </td>
          </tr>

          {/* 請款說明與簽核區 */}
          <tr>
            <td colSpan={2} className="bg-slate-100 font-bold p-2 text-center border-r border-slate-800 align-middle">
              請款說明
            </td>
            <td colSpan={5} className="p-0 border-r border-slate-800 align-top">
              <div className="divide-y divide-slate-100 min-h-[140px]">
                {displayLines.map((line, idx) => (
                  <div key={idx} className="px-2 py-1 min-h-[24px] text-slate-800 whitespace-pre-wrap break-words">
                    {line}
                  </div>
                ))}
              </div>
            </td>
            <td className="p-0 align-top">
              <div className="flex flex-col h-full divide-y divide-slate-800 text-center">
                <div className="p-1 bg-slate-50 font-bold text-xs">總經理</div>
                <div className="h-16"></div>
                <div className="p-1 bg-slate-50 font-bold text-xs">董事長</div>
                <div className="h-16"></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 表單編號腳註 */}
      <div className="flex justify-end mt-2 text-[10px] text-slate-400 font-mono">
        FM0302-1
      </div>
    </div>
  );
};
