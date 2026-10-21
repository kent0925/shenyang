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

  const contractAmt = data.contractTotal
    ? parseFloat(String(data.contractTotal).replace(/,/g, '')) || 0
    : 0;
  const balanceAmt = contractAmt - payable;

  const formattedBank = formatPaymentBankAccount(data);
  const descLines = data.description ? data.description.split('\n') : [];
  const displayLinesCount = 16;
  const displayLines: string[] = [];
  for (let i = 0; i < displayLinesCount; i++) {
    displayLines.push(descLines[i] || '');
  }

  const sr = data.specialRequirements;

  return (
    <div
      id={id}
      className="bg-white text-black px-7 py-4 mx-auto text-[11px] leading-normal border border-slate-300 shadow-sm print:border-none print:shadow-none"
      style={{
        width: '794px',
        boxSizing: 'border-box',
        fontFamily: '"BiauKai", "DFKai-SB", "PMingLiU", "MingLiU", serif',
      }}
    >
      {/* 抬頭 (Row 1-2) */}
      <div className="text-center mb-1">
        <h1 className="text-xl font-bold tracking-wider">{data.company || '昇陽開發實業股份有限公司'}</h1>
        <h2 className="text-lg font-bold tracking-[0.5em] mt-0.5 pl-[0.5em]">請　款　單</h2>
      </div>

      {/* 申請日 (Row 3) */}
      <div className="flex justify-end mb-1 text-[11px]">
        <span>申請日：</span>
        <span className="inline-block border-b border-black min-w-[28px] text-center font-mono">{applyDateParts?.rocYear || '　'}</span>
        <span>年</span>
        <span className="inline-block border-b border-black min-w-[20px] text-center font-mono">{applyDateParts?.month || '　'}</span>
        <span>月</span>
        <span className="inline-block border-b border-black min-w-[20px] text-center font-mono">{applyDateParts?.day || '　'}</span>
        <span>日</span>
      </div>

      {/* 主表格 (Row 4-37) 嚴格100%對照母版Excel格位 (26欄 x 37列拓撲) */}
      {/* 邊框嚴格設定於 <td> 儲存格，每一列最右側 <td> 均包含 border-r border-black 確保右邊外框收邊完整封閉 */}
      <table className="w-full border-collapse border border-black text-[11px] table-fixed">
        <colgroup>
          <col style={{ width: '3.625%' }} />  {/* E: 付款明細 / 單據粘貼處 */}
          <col style={{ width: '4.000%' }} />  {/* F: 期次 / 本期 / 估驗 / 特殊要求 / 請款說明 */}
          <col style={{ width: '7.000%' }} />  {/* G: 期次值 / 合約金額與累計實支標題 */}
          <col style={{ width: '14.125%' }} /> {/* H: (1)請款額 / 合約金額數值 */}
          <col style={{ width: '2.625%' }} />  {/* I: (2) / 餘額或超支標題 */}
          <col style={{ width: '1.875%' }} />  {/* J: (2) / 餘額數值 */}
          <col style={{ width: '8.125%' }} />  {/* K: (2) / 餘額數值 */}
          <col style={{ width: '10.125%' }} /> {/* L: (3)預付款沖銷 */}
          <col style={{ width: '2.500%' }} />  {/* M: (3) / 預算查認者標題 */}
          <col style={{ width: '3.250%' }} />  {/* N: (4)罰扣 / 預算查認空白簽名 */}
          <col style={{ width: '2.500%' }} />  {/* O: (4) / 預算查認空白簽名 */}
          <col style={{ width: '2.500%' }} />  {/* P: (4) / 預算查認空白簽名 */}
          <col style={{ width: '2.500%' }} />  {/* Q: (4) / 預算查認空白簽名 */}
          <col style={{ width: '2.500%' }} />  {/* R: (4) / 預算查認空白簽名 */}
          <col style={{ width: '2.500%' }} />  {/* S: (4) / 預算查認空白簽名 */}
          <col style={{ width: '2.750%' }} />  {/* T: (5)實付金額 / 會同驗收者標題 */}
          <col style={{ width: '2.875%' }} />  {/* U: 主管簽核 */}
          <col style={{ width: '2.625%' }} />  {/* V: 主管簽核 */}
          <col style={{ width: '2.625%' }} />  {/* W: 主管簽核 */}
          <col style={{ width: '4.250%' }} />  {/* X: 主管簽核 */}
          <col style={{ width: '2.625%' }} />  {/* Y: 申請部門 / 經辦 / 財務 / 總經理 / 董事長標題 */}
          <col style={{ width: '2.750%' }} />  {/* Z: 經辦 / 複核 / 主管標題 / 各簽名空白欄 */}
          <col style={{ width: '3.000%' }} />  {/* AA */}
          <col style={{ width: '3.000%' }} />  {/* AB */}
          <col style={{ width: '3.000%' }} />  {/* AC */}
          <col style={{ width: '3.250%' }} />  {/* AD */}
        </colgroup>
        <tbody>
          {/* Row 4: 標題列 (專案代號/名稱、請購單編號、受款人/廠商、申請部門 rs=13、經辦 rs=4、經辦簽名 rs=4) */}
          <tr className="h-[25px]">
            <td colSpan={4} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">專案代號/名稱</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">請購單編號</td>
            <td colSpan={11} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">受款人/廠商</td>
            {/* Y4:Y16 申請部門 (跨13列，垂直均勻對齊) */}
            <td rowSpan={13} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">
              <div className="flex flex-col justify-around h-full py-4 text-[11px] leading-tight">
                <span>申</span>
                <span>請</span>
                <span>部</span>
                <span>門</span>
              </div>
            </td>
            {/* Z4:Z7 經辦 (跨4列) */}
            <td rowSpan={4} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>經</span>
                <span className="mt-3">辦</span>
              </div>
            </td>
            {/* AA4:AD7 經辦簽名格 (跨4列，包含最右收邊線 border-r) */}
            <td colSpan={4} rowSpan={4} className="border-r border-b border-black p-0.5 align-middle"></td>
          </tr>

          {/* Row 5: 專案名稱、請購單號、廠商名稱 */}
          <tr className="h-[25px]">
            <td colSpan={4} className="border-r border-b border-black p-0.5 text-center align-middle font-medium">{data.project}</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-center align-middle font-mono">{data.requisitionNumber}</td>
            <td colSpan={11} className="border-r border-b border-black p-0.5 text-center align-middle font-medium">
              <div>{data.vendor}</div>
              {data.vendorTaxId?.trim() ? (
                <div className="text-[10px] text-slate-700 font-mono">（統編：{data.vendorTaxId.trim()}）</div>
              ) : null}
            </td>
          </tr>

          {/* Row 6: 費用歸屬部門、合約/訂購單編號、受款人/廠商匯款帳號 */}
          <tr className="h-[25px]">
            <td colSpan={4} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">費用歸屬部門</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">合約/訂購單編號</td>
            <td colSpan={11} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">受款人/廠商匯款帳號</td>
          </tr>

          {/* Row 7: 內容列 (rs=2) */}
          <tr className="h-[25px]">
            <td colSpan={4} rowSpan={2} className="border-r border-b border-black p-0.5 text-center align-middle">{data.department}</td>
            <td colSpan={5} rowSpan={2} className="border-r border-b border-black p-0.5 text-center align-middle font-mono">{data.contractNumber}</td>
            <td colSpan={11} rowSpan={2} className="border-r border-b border-black p-1 text-center align-middle whitespace-pre-wrap leading-tight text-[10px] font-mono">{formattedBank}</td>
          </tr>

          {/* Row 8: 複核 (rs=3)、複核簽名格 (rs=3) */}
          <tr className="h-[25px]">
            {/* Z8:Z10 複核 (跨3列) */}
            <td rowSpan={3} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>複</span>
                <span className="mt-2">核</span>
              </div>
            </td>
            {/* AA8:AD10 複核簽名格 (跨3列，包含最右收邊線 border-r) */}
            <td colSpan={4} rowSpan={3} className="border-r border-b border-black p-0.5 align-middle"></td>
          </tr>

          {/* Row 9: 費用性質、合約/訂購單總額、付款到期日 */}
          <tr className="h-[25px]">
            <td colSpan={4} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">費用性質</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">合約/訂購單總額</td>
            <td colSpan={11} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">付款到期日</td>
          </tr>

          {/* Row 10: 費用性質內容、合約總額、付款到期日年月日 */}
          <tr className="h-[25px]">
            <td colSpan={4} className="border-r border-b border-black p-0.5 text-center align-middle">{data.expenseNature}</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2">{formatCurrency(data.contractTotal)}</td>
            <td colSpan={2} className="border-b border-black p-0.5 text-center align-middle font-mono">{dueDateParts?.rocYear || '　'}</td>
            <td className="border-b border-black p-0.5 text-center align-middle">年</td>
            <td colSpan={2} className="border-b border-black p-0.5 text-center align-middle font-mono">{dueDateParts?.month || '　'}</td>
            <td className="border-b border-black p-0.5 text-center align-middle">月</td>
            <td colSpan={2} className="border-b border-black p-0.5 text-center align-middle font-mono">{dueDateParts?.day || '　'}</td>
            <td className="border-b border-black p-0.5 text-center align-middle">日</td>
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center align-middle"></td>
          </tr>

          {/* Row 11: 付款明細標題列 (1)~(5) 與 期次、主管 (rs=6)、主管簽名格 (rs=6) */}
          <tr className="h-[25px]">
            {/* E11:E16 付款明細 (跨6列) */}
            <td rowSpan={6} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>付</span>
                <span className="mt-1">款</span>
                <span className="mt-1">明</span>
                <span className="mt-1">細</span>
              </div>
            </td>
            {/* F11:F12 期次 (跨2列) */}
            <td rowSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">期次</td>
            {/* G11:G12 期次數值 (跨2列) */}
            <td rowSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle font-mono">
              {data.installment || '1'}
            </td>
            <td className="border-r border-b border-black p-0.5 text-center font-bold align-middle">（1）</td>
            <td colSpan={3} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">（2）</td>
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">（3）</td>
            <td colSpan={6} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">（4）</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px]">（5）=(1)-(2)-(3)-(4)</td>
            {/* Z11:Z16 主管 (跨6列) */}
            <td rowSpan={6} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>主</span>
                <span className="mt-4">管</span>
              </div>
            </td>
            {/* AA11:AD16 主管簽名格 (跨6列，包含最右收邊線 border-r) */}
            <td colSpan={4} rowSpan={6} className="border-r border-b border-black p-0.5 align-middle"></td>
          </tr>

          {/* Row 12: 各金額欄位說明 */}
          <tr className="h-[25px] text-[10px]">
            <td className="border-r border-b border-black p-0.5 text-center font-bold align-middle">請款/驗收/預付額</td>
            <td colSpan={3} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">保留金額</td>
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">預付款沖銷</td>
            <td colSpan={6} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">罰扣（折讓金額）</td>
            <td colSpan={5} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">實付金額</td>
          </tr>

          {/* Row 13: 本期金額列 (rs=2) */}
          <tr className="h-[25px]">
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px]">本期</td>
            <td rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2">{formatCurrency(data.currentAmount)}</td>
            <td colSpan={3} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2">{formatCurrency(data.retentionAmount)}</td>
            <td colSpan={2} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2">{formatCurrency(data.advanceDeduction)}</td>
            <td colSpan={6} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2">{formatCurrency(data.penaltyDiscount)}</td>
            <td colSpan={5} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono font-bold pr-2">{formatCurrency(payable) || '-'}</td>
          </tr>

          {/* Row 14: 估驗/請款 */}
          <tr className="h-[25px]">
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px]">估驗/請款</td>
          </tr>

          {/* Row 15: 截至本期止金額列 (rs=2) */}
          <tr className="h-[25px]">
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px]">截至本期止</td>
            <td rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2"></td>
            <td colSpan={3} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2"></td>
            <td colSpan={2} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2"></td>
            <td colSpan={6} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono pr-2"></td>
            <td colSpan={5} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono font-bold pr-2">-</td>
          </tr>

          {/* Row 16: 累計請款 */}
          <tr className="h-[25px]">
            <td colSpan={2} className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px]">累計請款</td>
          </tr>

          {/* Row 17: 預算管理 (Row 17-18) 列高增加至34px以符合母版66pt規範，徹底消除PDF文字切線 */}
          <tr className="h-[34px]">
            {/* E17:F18 預算管理 (跨2列) */}
            <td colSpan={2} rowSpan={2} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[10px] leading-tight tracking-widest py-1">
                <span>預</span>
                <span>算</span>
                <span>管</span>
                <span>理</span>
              </div>
            </td>
            {/* G17: 合約金額/預算金額 標題 */}
            <td className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px] leading-tight">
              合約金額<br/>/預算金額
            </td>
            {/* H17: 合約金額數值 */}
            <td className="border-r border-b border-black p-0.5 text-right align-middle font-mono font-bold pr-2">
              {contractAmt ? formatCurrency(contractAmt) : ''}
            </td>
            {/* I17:I18 餘額或超支 (跨2列) */}
            <td rowSpan={2} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[8.5px] leading-tight tracking-tighter py-1">
                <span>餘</span>
                <span>額</span>
                <span>或</span>
                <span>超</span>
                <span>支</span>
              </div>
            </td>
            {/* J17:L18 餘額數值 (跨2列, 跨3欄) */}
            <td colSpan={3} rowSpan={2} className="border-r border-b border-black p-0.5 text-right align-middle font-mono font-bold pr-2">
              {contractAmt ? formatCurrency(balanceAmt) : ''}
            </td>
            {/* M17:M18 預算查認者 (跨2列) */}
            <td rowSpan={2} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[8.5px] leading-tight tracking-tighter py-1">
                <span>預</span>
                <span>算</span>
                <span>查</span>
                <span>認</span>
                <span>者</span>
              </div>
            </td>
            {/* N17:S18 預算查認空白簽名欄 (跨2列, 跨6欄，設定 min-w 確保絕對不被擠壓) */}
            <td colSpan={6} rowSpan={2} className="border-r border-b border-black p-0.5 align-middle min-w-[70px]">&nbsp;</td>
            {/* T17:T18 會同驗收者 (跨2列) */}
            <td rowSpan={2} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[8.5px] leading-tight tracking-tighter py-1">
                <span>會</span>
                <span>同</span>
                <span>驗</span>
                <span>收</span>
                <span>者</span>
              </div>
            </td>
            {/* U17:X18 主管 (跨2列, 跨4欄，下方純白無任何橫線) */}
            <td colSpan={4} rowSpan={2} className="border-r border-b border-black p-1 text-left align-top">
              <span className="font-bold text-[10px]">主　管</span>
            </td>
            {/* Y17:AD18 經辦 (跨2列, 跨6欄，包含最右收邊線 border-r) */}
            <td colSpan={6} rowSpan={2} className="border-r border-b border-black p-1 text-left align-top">
              <span className="font-bold text-[10px]">經　辦</span>
            </td>
          </tr>

          {/* Row 18: 累計實支金額 */}
          <tr className="h-[34px]">
            <td className="border-r border-b border-black p-0.5 text-center font-bold align-middle text-[10px] leading-tight">
              累計實支<br/>金額
            </td>
            <td className="border-r border-b border-black p-0.5 text-right align-middle font-mono font-bold pr-2">
              {payable ? formatCurrency(payable) : ''}
            </td>
          </tr>

          {/* Row 19: 空白間隔列 (整列合併，包含最右收邊線 border-r) */}
          <tr className="h-1.5 bg-white">
            <td colSpan={26} className="border-r border-b border-black p-0"></td>
          </tr>

          {/* Row 20: 單據粘貼處 rs=18、特殊要求 rs=2、第1列核選項目、財務部簽認 rs=6、財務簽章 rs=6 */}
          <tr className="h-[25px] text-[10px]">
            {/* E20:E37 單據粘貼處 (跨18列，一路到底垂直均勻分布) */}
            <td rowSpan={18} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">
              <div className="flex flex-col justify-around h-full py-8 text-[11px] leading-relaxed">
                <span>單</span>
                <span>據</span>
                <span>粘</span>
                <span>貼</span>
                <span>處</span>
              </div>
            </td>
            {/* F20:F21 特殊要求 (跨2列) 字級設為7.5px以確保上下留白充裕，絕不卡到邊線 */}
            <td rowSpan={2} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[7.5px] leading-tight tracking-tight py-0.5">
                <span>特</span>
                <span>殊</span>
                <span>要</span>
                <span>求</span>
              </div>
            </td>
            {/* G20: 方塊 */}
            <td className="p-0.5 text-center align-middle font-bold text-xs">{sr.noCross ? '☑' : '☐'}</td>
            {/* H20: 請勿劃線 */}
            <td className="p-0.5 align-middle whitespace-nowrap">請勿劃線</td>
            {/* I20: 方塊 */}
            <td className="p-0.5 text-center align-middle font-bold text-xs">{sr.cashiersCheck ? '☑' : '☐'}</td>
            {/* J20:M20 請開立銀行本票/台銀支票 */}
            <td colSpan={4} className="p-0.5 align-middle whitespace-nowrap">請開立銀行本票/台銀支票</td>
            {/* N20: 方塊 */}
            <td className="p-0.5 text-center align-middle font-bold text-xs">{sr.wireTransfer ? '☑' : '☐'}</td>
            {/* O20:S20 請以匯款支付 */}
            <td colSpan={5} className="p-0.5 align-middle whitespace-nowrap">請以匯款支付</td>
            {/* T20: 方塊 */}
            <td className="p-0.5 text-center align-middle font-bold text-xs">{sr.offsetBorrowing ? '☑' : '☐'}</td>
            {/* U20:X20 請沖銷借支款 */}
            <td colSpan={4} className="border-r border-black p-0.5 align-middle whitespace-nowrap">請沖銷借支款</td>
            {/* Y20:Y25 財務部簽認 (跨6列，單一border-r border-b維持全表一致細線，不重複加粗) */}
            <td rowSpan={6} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>財</span>
                <span>務</span>
                <span>部</span>
                <span>簽</span>
                <span>認</span>
              </div>
            </td>
            {/* Z20:AD25 財務簽章空白欄 (跨6列，包含最右收邊線 border-r) */}
            <td colSpan={5} rowSpan={6} className="border-r border-b border-black p-0.5 align-middle"></td>
          </tr>

          {/* Row 21: 特殊要求第2列 */}
          <tr className="h-[25px] text-[10px]">
            {/* G21: 方塊 */}
            <td className="border-b border-black p-0.5 text-center align-middle font-bold text-xs">{sr.noEndorse ? '☑' : '☐'}</td>
            {/* H21: 請勿禁止背書轉讓 */}
            <td className="border-b border-black p-0.5 align-middle whitespace-nowrap">請勿禁止背書轉讓</td>
            {/* I21: 方塊 */}
            <td className="border-b border-black p-0.5 text-center align-middle font-bold text-xs">{sr.postDatedCheck ? '☑' : '☐'}</td>
            {/* J21:M21 請付遠期支票予受款者，並於 */}
            <td colSpan={4} className="border-b border-black p-0.5 align-middle whitespace-nowrap">請付遠期支票予受款者，並於</td>
            {/* N21: 年 */}
            <td className="border-b border-black p-0.5 text-center align-middle font-mono">{postDatedParts?.rocYear || '　'}</td>
            <td className="border-b border-black p-0.5 align-middle">年</td>
            {/* P21: 月 */}
            <td className="border-b border-black p-0.5 text-center align-middle font-mono">{postDatedParts?.month || '　'}</td>
            <td className="border-b border-black p-0.5 align-middle">月</td>
            {/* R21: 日 */}
            <td className="border-b border-black p-0.5 text-center align-middle font-mono">{postDatedParts?.day || '　'}</td>
            <td className="border-b border-black p-0.5 align-middle">日</td>
            {/* T21:X21 付予支票。 */}
            <td colSpan={5} className="border-r border-b border-black p-0.5 align-middle whitespace-nowrap">付予支票。</td>
          </tr>

          {/* Row 22 到 Row 37: 請款說明 (跨16列) 與 16條橫線、總經理 (跨6列)、董事長 (跨6列) */}
          {/* Row 22: 請款說明第1行 */}
          <tr className="h-[23px]">
            {/* F22:F37 請款說明 (跨16列) */}
            <td rowSpan={16} className="border-r border-b border-black p-0.5 text-center font-bold align-middle">
              <div className="flex flex-col justify-around h-full py-6 text-[11px] leading-relaxed">
                <span>請</span>
                <span>款</span>
                <span>說</span>
                <span>明</span>
              </div>
            </td>
            <td colSpan={18} className="border-r border-black border-b border-b-slate-300 px-2 py-0.5 align-middle text-[11px] whitespace-pre-wrap break-words">
              {displayLines[0]}
            </td>
          </tr>

          {/* Row 23-25: 說明行2-4 (右側財務簽章跨列中，無任何橫線滲透) */}
          {[1, 2, 3].map(idx => (
            <tr key={idx} className="h-[23px]">
              <td colSpan={18} className="border-r border-black border-b border-b-slate-300 px-2 py-0.5 align-middle text-[11px] whitespace-pre-wrap break-words">
                {displayLines[idx]}
              </td>
            </tr>
          ))}

          {/* Row 26: 說明行5 + 總經理 (跨6列) + 總經理簽名空白格 (跨6列，包含最右收邊線 border-r) */}
          <tr className="h-[23px]">
            <td colSpan={18} className="border-r border-black border-b border-b-slate-300 px-2 py-0.5 align-middle text-[11px] whitespace-pre-wrap break-words">
              {displayLines[4]}
            </td>
            {/* Y26:Y31 總經理 (跨6列，單一border-r border-b維持全表一致細線) */}
            <td rowSpan={6} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>總</span>
                <span className="my-2">經</span>
                <span>理</span>
              </div>
            </td>
            {/* Z26:AD31 總經理空白簽名 (跨6列，包含最右收邊線 border-r) */}
            <td colSpan={5} rowSpan={6} className="border-r border-b border-black p-0.5 align-middle"></td>
          </tr>

          {/* Row 27-31: 說明行6-10 (右側總經理簽名格跨列中，無任何橫線滲透) */}
          {[5, 6, 7, 8, 9].map(idx => (
            <tr key={idx} className="h-[23px]">
              <td colSpan={18} className="border-r border-black border-b border-b-slate-300 px-2 py-0.5 align-middle text-[11px] whitespace-pre-wrap break-words">
                {displayLines[idx]}
              </td>
            </tr>
          ))}

          {/* Row 32: 說明行11 + 董事長 (跨6列) + 董事長簽名空白格 (跨6列，包含最右收邊線 border-r) */}
          <tr className="h-[23px]">
            <td colSpan={18} className="border-r border-black border-b border-b-slate-300 px-2 py-0.5 align-middle text-[11px] whitespace-pre-wrap break-words">
              {displayLines[10]}
            </td>
            {/* Y32:Y37 董事長 (跨6列，單一border-r border-b維持全表一致細線) */}
            <td rowSpan={6} className="border-r border-b border-black p-0 text-center font-bold align-middle">
              <div className="flex flex-col justify-center items-center h-full text-[11px] leading-relaxed tracking-widest">
                <span>董</span>
                <span className="my-2">事</span>
                <span>長</span>
              </div>
            </td>
            {/* Z32:AD37 董事長空白簽名 (跨6列，包含最右收邊線 border-r) */}
            <td colSpan={5} rowSpan={6} className="border-r border-b border-black p-0.5 align-middle"></td>
          </tr>

          {/* Row 33-37: 說明行12-16 (右側董事長簽名格跨列中，無任何橫線滲透) */}
          {[11, 12, 13, 14, 15].map((idx, i) => (
            <tr key={idx} className="h-[23px]">
              <td colSpan={18} className={`border-r border-black px-2 py-0.5 align-middle text-[11px] whitespace-pre-wrap break-words ${i === 4 ? "border-b border-black" : "border-b border-b-slate-300"}`}>
                {displayLines[idx]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 表單編號腳註 (Row 38) */}
      <div className="flex justify-end mt-1 text-[10px] font-mono">
        FM0302-1
      </div>
    </div>
  );
};
