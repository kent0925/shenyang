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
  // 嚴格對照 Excel 母版 G22:G37 共 16 列請款說明橫線
  const totalDescLines = 16;
  const displayLines: string[] = [];
  for (let i = 0; i < totalDescLines; i++) {
    displayLines.push(descLines[i] || '');
  }

  const sr = data.specialRequirements;

  return (
    <div
      id={id}
      className="bg-white text-black px-6 py-4 max-w-[820px] mx-auto text-xs leading-normal font-sans"
      style={{ boxSizing: 'border-box' }}
    >
      {/* 抬頭與表頭標題 */}
      <div className="text-center mb-1">
        <h1 className="text-xl font-bold tracking-widest font-serif">{data.company || '昇陽開發實業股份有限公司'}</h1>
        <h2 className="text-lg font-bold tracking-[0.5em] mt-1 font-serif">請　款　單</h2>
      </div>

      {/* 申請日（對齊 Excel 母版：純文字無下底線，右側靠齊） */}
      <div className="flex justify-end mb-1 text-[11px] font-mono tracking-wide">
        <span>申請日：　</span>
        <span className="inline-block min-w-[28px] text-center font-semibold">{applyDateParts?.rocYear || '115'}</span>
        <span>　年　</span>
        <span className="inline-block min-w-[20px] text-center font-semibold">{applyDateParts?.month || '10'}</span>
        <span>　月　</span>
        <span className="inline-block min-w-[20px] text-center font-semibold">{applyDateParts?.day || '21'}</span>
        <span>　日</span>
      </div>

      {/* 主表格（全表純白底黑線，精確復刻 Excel 母版 E4:AD37） */}
      <div className="border border-black text-xs border-collapse">
        {/* 上半部：基本資料 + 付款明細 + 右側簽核欄 */}
        <div className="flex border-b border-black">
          {/* 左側主體（基本資料 + 付款明細） */}
          <div className="flex-1 border-r border-black flex flex-col">
            {/* 基本資料 1：專案代號、請購單、受款人（上下標題/內容結構） */}
            <div className="grid grid-cols-12 border-b border-black text-center text-[11px]">
              <div className="col-span-4 border-r border-black py-0.5">專案代號/名稱</div>
              <div className="col-span-3 border-r border-black py-0.5">請購單編號</div>
              <div className="col-span-5 py-0.5">受款人/廠商</div>
            </div>
            <div className="grid grid-cols-12 border-b border-black min-h-[30px] items-center text-[11px]">
              <div className="col-span-4 border-r border-black px-1.5 py-1 text-center font-medium">
                {data.project}
              </div>
              <div className="col-span-3 border-r border-black px-1.5 py-1 text-center font-mono">
                {data.requisitionNumber}
              </div>
              <div className="col-span-5 px-1.5 py-1 text-center font-medium">
                <div>{data.vendor}</div>
                {data.vendorTaxId?.trim() ? (
                  <div className="text-[10px] font-mono">（統編：{data.vendorTaxId.trim()}）</div>
                ) : null}
              </div>
            </div>

            {/* 基本資料 2：費用歸屬部門、合約號、受款人匯款帳號 */}
            <div className="grid grid-cols-12 border-b border-black text-center text-[11px]">
              <div className="col-span-4 border-r border-black py-0.5">費用歸屬部門</div>
              <div className="col-span-3 border-r border-black py-0.5">合約/訂購單編號</div>
              <div className="col-span-5 py-0.5">受款人/廠商匯款帳號</div>
            </div>
            <div className="grid grid-cols-12 border-b border-black min-h-[46px] items-center text-[11px]">
              <div className="col-span-4 border-r border-black px-1.5 py-1 text-center">
                {data.department}
              </div>
              <div className="col-span-3 border-r border-black px-1.5 py-1 text-center font-mono">
                {data.contractNumber}
              </div>
              <div className="col-span-5 px-1.5 py-1 font-mono text-[10.5px] leading-tight text-left">
                {formattedBank}
              </div>
            </div>

            {/* 基本資料 3：費用性質、合約總額、付款到期日 */}
            <div className="grid grid-cols-12 border-b border-black text-center text-[11px]">
              <div className="col-span-4 border-r border-black py-0.5">費用性質</div>
              <div className="col-span-3 border-r border-black py-0.5">合約/訂購單總額</div>
              <div className="col-span-5 py-0.5">付款到期日</div>
            </div>
            <div className="grid grid-cols-12 border-b border-black min-h-[28px] items-center text-[11px]">
              <div className="col-span-4 border-r border-black px-1.5 py-1 text-center">
                {data.expenseNature}
              </div>
              <div className="col-span-3 border-r border-black px-1.5 py-1 text-center font-mono">
                {formatCurrency(data.contractTotal)}
              </div>
              <div className="col-span-5 px-1.5 py-1 text-center font-mono text-[11px]">
                {dueDateParts ? `${dueDateParts.rocYear}　年　${dueDateParts.month}　月　${dueDateParts.day}　日` : '　年　月　日'}
              </div>
            </div>

            {/* 付款明細主體（左側標籤 + 5 欄數據） */}
            <div className="flex flex-1">
              {/* 直立付款明細標籤 */}
              <div className="w-6 border-r border-black flex items-center justify-center p-0.5 text-center leading-snug font-medium tracking-widest text-[11px]">
                付<br/>款<br/>明<br/>細
              </div>

              {/* 期次與金額欄 */}
              <div className="flex-1 flex flex-col">
                {/* 標題第 1 列：（1）～（5） */}
                <div className="grid grid-cols-12 border-b border-black text-center text-[11px] leading-none py-1">
                  <div className="col-span-2 border-r border-black">期次</div>
                  <div className="col-span-2 border-r border-black">（1）</div>
                  <div className="col-span-2 border-r border-black">（2）</div>
                  <div className="col-span-2 border-r border-black">（3）</div>
                  <div className="col-span-2 border-r border-black">（4）</div>
                  <div className="col-span-2">（5）=(1)-(2)-(3)-(4)</div>
                </div>

                {/* 標題第 2 列：文字名稱 */}
                <div className="grid grid-cols-12 border-b border-black text-center text-[10px] leading-tight py-1 items-center min-h-[24px]">
                  <div className="col-span-2 border-r border-black"></div>
                  <div className="col-span-2 border-r border-black">請款/驗收/預付額</div>
                  <div className="col-span-2 border-r border-black">保留金額</div>
                  <div className="col-span-2 border-r border-black">預付款沖銷</div>
                  <div className="col-span-2 border-r border-black">罰扣（折讓金額）</div>
                  <div className="col-span-2">實付金額</div>
                </div>

                {/* 本期 估驗/請款 */}
                <div className="grid grid-cols-12 border-b border-black text-center font-mono text-[11px] min-h-[26px] items-center">
                  <div className="col-span-2 border-r border-black font-sans text-[10px] leading-tight py-0.5">
                    本期<br/>估驗/請款
                  </div>
                  <div className="col-span-2 border-r border-black text-right px-1.5">
                    {formatCurrency(data.currentAmount)}
                  </div>
                  <div className="col-span-2 border-r border-black text-right px-1.5">
                    {formatCurrency(data.retentionAmount)}
                  </div>
                  <div className="col-span-2 border-r border-black text-right px-1.5">
                    {formatCurrency(data.advanceDeduction)}
                  </div>
                  <div className="col-span-2 border-r border-black text-right px-1.5">
                    {formatCurrency(data.penaltyDiscount)}
                  </div>
                  <div className="col-span-2 text-right px-1.5 font-bold">
                    {formatCurrency(payable) || '-'}
                  </div>
                </div>

                {/* 截至本期止 累計請款 */}
                <div className="grid grid-cols-12 text-center font-mono text-[11px] min-h-[26px] items-center">
                  <div className="col-span-2 border-r border-black font-sans text-[10px] leading-tight py-0.5">
                    截至本期止<br/>累計請款
                  </div>
                  <div className="col-span-2 border-r border-black px-1.5"></div>
                  <div className="col-span-2 border-r border-black px-1.5"></div>
                  <div className="col-span-2 border-r border-black px-1.5"></div>
                  <div className="col-span-2 border-r border-black px-1.5"></div>
                  <div className="col-span-2 text-center px-1.5 font-bold">-</div>
                </div>
              </div>
            </div>
          </div>

          {/* 右側簽核區（垂直貫穿 申請部門 + 經辦/複核/主管） */}
          <div className="w-24 flex">
            {/* 申請部門（整條直立貫穿） */}
            <div className="w-6 border-r border-black flex flex-col items-center justify-around py-4 text-center leading-none font-medium tracking-widest text-[11px]">
              <span>申</span>
              <span>請</span>
              <span>部</span>
              <span>門</span>
            </div>

            {/* 經辦 / 複核 / 主管 簽核格 */}
            <div className="flex-1 flex flex-col text-center text-[11px]">
              {/* 經辦（對齊專案代號高度） */}
              <div className="h-[48px] border-b border-black flex flex-col">
                <div className="pt-1 font-medium">經　辦</div>
                <div className="flex-1"></div>
              </div>

              {/* 複核（對齊費用歸屬+費用性質高度） */}
              <div className="h-[96px] border-b border-black flex flex-col">
                <div className="pt-1 font-medium">複　核</div>
                <div className="flex-1"></div>
              </div>

              {/* 主管（對齊付款明細高度） */}
              <div className="flex-1 flex flex-col min-h-[74px]">
                <div className="pt-2 font-medium">主　管</div>
                <div className="flex-1"></div>
              </div>
            </div>
          </div>
        </div>

        {/* 中部：預算管理區（對應 Row 17~18） */}
        <div className="flex border-b border-black text-[11px] min-h-[38px]">
          {/* 直立預算管理標籤 */}
          <div className="w-6 border-r border-black flex items-center justify-center p-0.5 text-center leading-tight font-medium text-[11px]">
            預算管理
          </div>

          {/* 合約金額/預算金額 & 累計實支金額 */}
          <div className="w-28 border-r border-black flex flex-col text-center">
            <div className="border-b border-black py-0.5 leading-tight">合約金額/預算金額</div>
            <div className="py-0.5 leading-tight">累計實支金額</div>
          </div>

          {/* 金額做動呈現（連動合約總額與本期實付） */}
          <div className="w-24 border-r border-black flex flex-col text-right font-mono">
            <div className="border-b border-black h-1/2 px-1 text-right leading-[18px]">
              {formatCurrency(data.contractTotal)}
            </div>
            <div className="h-1/2 px-1 text-right leading-[18px]">
              {payable > 0 ? formatCurrency(payable) : '-'}
            </div>
          </div>

          {/* 餘額或超支 */}
          <div className="w-6 border-r border-black flex items-center justify-center p-0.5 text-center leading-tight font-medium text-[11px]">
            餘額或超支
          </div>

          {/* 餘額或超支做動呈現 */}
          <div className="flex-1 border-r border-black flex items-center justify-end px-2 font-mono font-bold text-[11px]">
            {data.contractTotal ? formatCurrency(parseFloat(data.contractTotal.replace(/,/g, '')) - payable) : '-'}
          </div>

          {/* 預算查認者 */}
          <div className="w-6 border-r border-black flex items-center justify-center p-0.5 text-center leading-tight font-medium text-[11px]">
            預算查認者
          </div>

          {/* 會同驗收者 */}
          <div className="w-6 border-r border-black flex items-center justify-center p-0.5 text-center leading-tight font-medium text-[11px]">
            會同驗收者
          </div>

          {/* 主管 / 經辦（並排在右側） */}
          <div className="w-24 flex text-center">
            <div className="w-1/2 border-r border-black flex flex-col">
              <div className="border-b border-black py-0.5 leading-tight">主管</div>
              <div className="flex-1 min-h-[18px]"></div>
            </div>
            <div className="w-1/2 flex flex-col">
              <div className="border-b border-black py-0.5 leading-tight">經辦</div>
              <div className="flex-1 min-h-[18px]"></div>
            </div>
          </div>
        </div>

        {/* 下半部：單據粘貼處 + 特殊要求 + 請款說明 + 簽核（對應 Row 20~37） */}
        <div className="flex">
          {/* 最左側直立窄欄：單據粘貼處（一貫到底） */}
          <div className="w-6 border-r border-black flex flex-col items-center justify-center py-8 text-center leading-loose font-bold tracking-widest text-[12px]">
            <span>單</span>
            <span>據</span>
            <span>粘</span>
            <span>貼</span>
            <span>處</span>
          </div>

          {/* 次左側標籤 + 內容主體 */}
          <div className="flex-1 flex flex-col border-r border-black">
            {/* 特殊要求區（高 2 列） */}
            <div className="flex border-b border-black text-[11px]">
              <div className="w-7 border-r border-black flex items-center justify-center p-1 text-center leading-tight font-medium">
                特殊<br/>要求
              </div>
              <div className="flex-1 flex flex-col px-3 py-1.5 text-[10.5px] justify-around">
                <div className="flex flex-wrap items-center justify-between">
                  <span>{sr.noCross ? '☑' : '☐'} 請勿劃線</span>
                  <span>{sr.cashiersCheck ? '☑' : '☐'} 請開立銀行本票/台銀支票</span>
                  <span>{sr.wireTransfer ? '☑' : '☐'} 請以匯款支付</span>
                  <span>{sr.offsetBorrowing ? '☑' : '☐'} 請沖銷借支款</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span>{sr.noEndorse ? '☑' : '☐'} 請勿禁止背書轉讓</span>
                  <span>
                    {sr.postDatedCheck ? '☑' : '☐'} 請付遠期支票予受款者，並於{' '}
                    <span className="font-mono px-1">{postDatedParts?.rocYear || '　'}</span>年{' '}
                    <span className="font-mono px-1">{postDatedParts?.month || '　'}</span>月{' '}
                    <span className="font-mono px-1">{postDatedParts?.day || '　'}</span>日付予支票。
                  </span>
                </div>
              </div>
            </div>

            {/* 請款說明區（左側標籤 + 16 列橫線） */}
            <div className="flex flex-1">
              <div className="w-7 border-r border-black flex flex-col items-center justify-center p-1 text-center leading-loose font-medium tracking-widest text-[11px]">
                <span>請</span>
                <span>款</span>
                <span>說</span>
                <span>明</span>
              </div>
              <div className="flex-1 flex flex-col divide-y divide-black">
                {displayLines.map((line, idx) => (
                  <div key={idx} className="h-[18px] px-2 text-[10.5px] leading-[18px] text-black whitespace-pre-wrap truncate">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 最右側簽核區：財務部簽認 / 總經理 / 董事長 */}
          <div className="w-24 flex flex-col text-center text-[11px]">
            {/* 財務部簽認（對齊特殊要求高度） */}
            <div className="h-[46px] border-b border-black flex">
              <div className="w-6 border-r border-black flex items-center justify-center p-0.5 leading-tight font-medium">
                財務部簽認
              </div>
              <div className="flex-1"></div>
            </div>

            {/* 總經理（對齊請款說明上半） */}
            <div className="flex-1 border-b border-black flex min-h-[120px]">
              <div className="w-6 border-r border-black flex flex-col items-center justify-center p-0.5 leading-loose font-medium tracking-widest">
                <span>總</span>
                <span>經</span>
                <span>理</span>
              </div>
              <div className="flex-1"></div>
            </div>

            {/* 董事長（對齊請款說明下半） */}
            <div className="flex-1 flex min-h-[120px]">
              <div className="w-6 border-r border-black flex flex-col items-center justify-center p-0.5 leading-loose font-medium tracking-widest">
                <span>董</span>
                <span>事</span>
                <span>長</span>
              </div>
              <div className="flex-1"></div>
            </div>
          </div>
        </div>
      </div>

      {/* 表單編號腳註 */}
      <div className="flex justify-end mt-1 text-[10px] font-mono">
        FM0302-1
      </div>
    </div>
  );
};
