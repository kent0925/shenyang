import React from 'react';
import { PaymentRequestData } from '../../models/paymentRequest';
import { parseDateParts } from '../../utils/date';
import { calculatePayableAmount, formatCurrency, formatPaymentBankAccount } from '../../utils/format';

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

  const formattedBank = formatPaymentBankAccount(data);
  const descLines = data.description ? data.description.split('\n') : [];
  const displayLinesCount = Math.max(descLines.length, 12);
  const displayLines: string[] = [];
  for (let i = 0; i < displayLinesCount; i++) {
    displayLines.push(descLines[i] || '');
  }

  const sr = data.specialRequirements;

  return (
    <div
      id={id}
      className="bg-white text-slate-900 p-8 max-w-[850px] mx-auto text-xs leading-normal border border-slate-300 shadow-sm print:border-none print:shadow-none font-sans"
      style={{ minHeight: '1120px' }}
    >
      {/* 抬頭 */}
      <div className="text-center mb-1">
        <h1 className="text-xl font-bold tracking-wider">{data.company || '昇陽開發實業股份有限公司'}</h1>
        <h2 className="text-lg font-bold tracking-widest mt-1">請　款　單</h2>
      </div>

      {/* 申請日 */}
      <div className="flex justify-end mb-1 text-xs font-mono">
        <span>申請日：</span>
        <span className="inline-block border-b border-slate-700 min-w-[28px] text-center">{applyDateParts?.rocYear || '　'}</span>
        <span>年</span>
        <span className="inline-block border-b border-slate-700 min-w-[20px] text-center">{applyDateParts?.month || '　'}</span>
        <span>月</span>
        <span className="inline-block border-b border-slate-700 min-w-[20px] text-center">{applyDateParts?.day || '　'}</span>
        <span>日</span>
      </div>

      {/* 主表格 */}
      <table className="w-full border-collapse border-2 border-slate-900 text-xs">
        <tbody>
          {/* 列 4~5：專案、請購單、受款人、申請部門、經辦 */}
          <tr className="border-b border-slate-900">
            <td className="w-24 bg-slate-100 font-bold p-1 text-center border-r border-slate-900">專案代號/名稱</td>
            <td className="p-1 border-r border-slate-900 font-medium">{data.project}</td>
            <td className="w-24 bg-slate-100 font-bold p-1 text-center border-r border-slate-900">請購單編號</td>
            <td className="w-32 p-1 border-r border-slate-900 font-mono">{data.requisitionNumber}</td>
            <td className="w-24 bg-slate-100 font-bold p-1 text-center border-r border-slate-900">受款人/廠商</td>
            <td className="p-1 border-r border-slate-900 font-medium">
              <div>{data.vendor}</div>
              {data.vendorTaxId?.trim() ? (
                <div className="text-[10px] text-slate-600 font-mono">統編：{data.vendorTaxId.trim()}</div>
              ) : null}
            </td>
            <td rowSpan={3} className="w-7 bg-slate-100 font-bold p-1 text-center border-r border-slate-900 align-middle leading-snug">
              申請部門
            </td>
            <td className="w-16 p-1 text-center border-slate-900 align-top">
              <div className="font-bold mb-4">經　　辦</div>
            </td>
          </tr>

          {/* 列 6~8：費用歸屬部門、合約號、受款人匯款帳號、複核 */}
          <tr className="border-b border-slate-900">
            <td className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900">費用歸屬部門</td>
            <td className="p-1 border-r border-slate-900">{data.department}</td>
            <td className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900">合約/訂購單編號</td>
            <td className="p-1 border-r border-slate-900 font-mono">{data.contractNumber}</td>
            <td className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900">受款人/廠商匯款帳號</td>
            <td className="p-1 border-r border-slate-900 font-mono whitespace-pre-wrap leading-tight">{formattedBank}</td>
            <td className="p-1 text-center border-slate-900 align-top">
              <div className="font-bold mb-4">複　　核</div>
            </td>
          </tr>

          {/* 列 9~10：費用性質、合約總額、付款到期日 */}
          <tr className="border-b-2 border-slate-900">
            <td className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900">費用性質</td>
            <td className="p-1 border-r border-slate-900">{data.expenseNature}</td>
            <td className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900">合約/訂購單總額</td>
            <td className="p-1 border-r border-slate-900 font-mono text-right">{formatCurrency(data.contractTotal)}</td>
            <td className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900">付款到期日</td>
            <td className="p-1 border-r border-slate-900 font-mono">
              {dueDateParts ? `${dueDateParts.rocYear} 年 ${dueDateParts.month} 月 ${dueDateParts.day} 日` : '　年　月　日'}
            </td>
            <td className="p-1 text-center border-slate-900"></td>
          </tr>

          {/* 列 11~12：付款明細標題 */}
          <tr className="bg-slate-100 font-bold text-center border-b border-slate-900">
            <td rowSpan={4} className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900 align-middle leading-snug w-7">
              付款明細
            </td>
            <td rowSpan={2} className="p-1 border-r border-slate-900 w-24">期次</td>
            <td className="p-1 border-r border-slate-900">（1）</td>
            <td className="p-1 border-r border-slate-900">（2）</td>
            <td className="p-1 border-r border-slate-900">（3）</td>
            <td className="p-1 border-r border-slate-900">（4）</td>
            <td colSpan={2} className="p-1 border-r border-slate-900">（5）=(1)-(2)-(3)-(4)</td>
            <td rowSpan={4} className="w-16 p-1 text-center border-slate-900 align-middle">
              <div className="font-bold">主　　管</div>
            </td>
          </tr>
          <tr className="bg-slate-50 font-bold text-center border-b border-slate-900 text-[11px]">
            <td className="p-1 border-r border-slate-900">請款/驗收/預付額</td>
            <td className="p-1 border-r border-slate-900">保留金額</td>
            <td className="p-1 border-r border-slate-900">預付款沖銷</td>
            <td className="p-1 border-r border-slate-900">罰扣（折讓金額）</td>
            <td colSpan={2} className="p-1 border-r border-slate-900">實付金額</td>
          </tr>

          {/* 列 13~14：本期 估驗/請款 */}
          <tr className="border-b border-slate-900 text-center font-mono h-7">
            <td className="bg-slate-50 font-bold border-r border-slate-900 text-[11px]">本期 估驗/請款</td>
            <td className="p-1 border-r border-slate-900 text-right">{formatCurrency(data.currentAmount)}</td>
            <td className="p-1 border-r border-slate-900 text-right">{formatCurrency(data.retentionAmount)}</td>
            <td className="p-1 border-r border-slate-900 text-right">{formatCurrency(data.advanceDeduction)}</td>
            <td className="p-1 border-r border-slate-900 text-right">{formatCurrency(data.penaltyDiscount)}</td>
            <td colSpan={2} className="p-1 border-r border-slate-900 text-right font-bold text-blue-900">
              {formatCurrency(payable) || '-'}
            </td>
          </tr>

          {/* 列 15~16：截至本期止 累計請款 */}
          <tr className="border-b-2 border-slate-900 text-center font-mono h-7 text-slate-500">
            <td className="bg-slate-50 font-bold border-r border-slate-900 text-[11px]">截至本期止 累計請款</td>
            <td className="p-1 border-r border-slate-900"></td>
            <td className="p-1 border-r border-slate-900"></td>
            <td className="p-1 border-r border-slate-900"></td>
            <td className="p-1 border-r border-slate-900"></td>
            <td colSpan={2} className="p-1 border-r border-slate-900">-</td>
          </tr>

          {/* 列 17~18：預算管理與會同驗收 */}
          <tr className="border-b border-slate-900">
            <td rowSpan={2} className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900 align-middle leading-snug">
              預算管理
            </td>
            <td className="bg-slate-50 p-1 border-r border-slate-900 font-bold text-center">合約金額/預算金額</td>
            <td className="p-1 border-r border-slate-900 font-mono text-right"></td>
            <td rowSpan={2} className="bg-slate-50 p-1 border-r border-slate-900 font-bold text-center align-middle">餘額或超支</td>
            <td rowSpan={2} className="p-1 border-r border-slate-900"></td>
            <td rowSpan={2} className="bg-slate-50 p-1 border-r border-slate-900 font-bold text-center align-middle">預算查認者</td>
            <td rowSpan={2} className="bg-slate-50 p-1 border-r border-slate-900 font-bold text-center align-middle">會同驗收者</td>
            <td className="bg-slate-50 p-1 border-r border-slate-900 font-bold text-center">主管</td>
            <td className="p-1 text-center border-slate-900">經辦</td>
          </tr>
          <tr className="border-b-2 border-slate-900">
            <td className="bg-slate-50 p-1 border-r border-slate-900 font-bold text-center">累計實支金額</td>
            <td className="p-1 border-r border-slate-900 font-mono text-right"></td>
            <td className="p-1 border-r border-slate-900 h-6"></td>
            <td className="p-1 text-center border-slate-900 h-6"></td>
          </tr>

          {/* 列 20~21：單據粘貼處與特殊要求 */}
          <tr className="border-b border-slate-900">
            <td rowSpan={2} className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900 align-middle leading-snug">
              單據粘貼處
            </td>
            <td rowSpan={2} className="bg-slate-100 font-bold p-1 text-center border-r border-slate-900 align-middle">
              特殊要求
            </td>
            <td colSpan={6} className="p-1.5 border-r border-slate-900">
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <span>{sr.noCross ? '☑' : '☐'} 請勿劃線</span>
                <span>{sr.cashiersCheck ? '☑' : '☐'} 請開立銀行本票/台銀支票</span>
                <span>{sr.wireTransfer ? '☑' : '☐'} 請以匯款支付</span>
                <span>{sr.offsetBorrowing ? '☑' : '☐'} 請沖銷借支款</span>
              </div>
            </td>
            <td rowSpan={2} className="p-1 text-center align-middle border-slate-900">
              <div className="font-bold text-slate-700">財務部簽認</div>
            </td>
          </tr>
          <tr className="border-b-2 border-slate-900">
            <td colSpan={6} className="p-1.5 border-r border-slate-900 text-[11px]">
              <div className="flex flex-wrap items-center gap-4">
                <span>{sr.noEndorse ? '☑' : '☐'} 請勿禁止背書轉讓</span>
                <span>
                  {sr.postDatedCheck ? '☑' : '☐'} 請付遠期支票予受款者，並於{' '}
                  <span className="font-mono underline font-bold px-1">{postDatedParts?.rocYear || '　'}</span>年{' '}
                  <span className="font-mono underline font-bold px-1">{postDatedParts?.month || '　'}</span>月{' '}
                  <span className="font-mono underline font-bold px-1">{postDatedParts?.day || '　'}</span>日付予支票。
                </span>
              </div>
            </td>
          </tr>

          {/* 列 22~37：請款說明與總經理、董事長簽核 */}
          <tr>
            <td colSpan={2} className="bg-slate-100 font-bold p-2 text-center border-r border-slate-900 align-middle">
              請款說明
            </td>
            <td colSpan={6} className="p-0 border-r border-slate-900 align-top">
              <div className="divide-y divide-slate-200 min-h-[220px]">
                {displayLines.map((line, idx) => (
                  <div key={idx} className="px-2 py-1 min-h-[20px] text-slate-800 whitespace-pre-wrap break-words">
                    {line}
                  </div>
                ))}
              </div>
            </td>
            <td className="p-0 align-top">
              <div className="flex flex-col h-full divide-y border-slate-900 text-center">
                <div className="p-1 bg-slate-50 font-bold text-xs border-b border-slate-900">總　經　理</div>
                <div className="h-24 border-b border-slate-900"></div>
                <div className="p-1 bg-slate-50 font-bold text-xs border-b border-slate-900">董　事　長</div>
                <div className="h-24"></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 表單編號腳註 */}
      <div className="flex justify-end mt-2 text-[10px] text-slate-500 font-mono">
        FM0302-1
      </div>
    </div>
  );
};
