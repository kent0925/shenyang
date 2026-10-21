import JSZip from 'jszip';
import { PaymentRequestData } from '../../models/paymentRequest';
import { parseDateParts } from '../../utils/date';
import { formatPaymentBankAccount, calculatePayableAmount } from '../../utils/format';
import { clearCellRange, updateSheetCell, updateSheetCellFormula } from './ooxmlHelper';

/**
 * 產生請款單 XLSX 檔案
 * 核心保證：
 * 1. 嚴格保留原始公式（如 T13: =H13-I13-L13-N13, T15 等），禁止覆寫任何公式儲存格
 * 2. 說明 G22:G37 全區先清除再填入，避免舊資料殘留
 * 3. 同步設定 VML 與 OpenXML ctrlProps 表單控制項之核取方塊狀態（保證 Excel 開啟 100% 打勾）
 * 4. 遠期支票年月日寫入 N21(年), P21(月), R21(日)，保留 O21(年), Q21(月), S21(日) 之文字標籤
 * 5. 合約總額 (I10) 設為千分位格式
 * 6. 預算管理 (I17, I18, M17) 公式與數值動態做動連動
 */
export async function generatePaymentRequestExcel(data: PaymentRequestData): Promise<Blob> {
  const response = await fetch('/templates/請款單.xlsx');
  if (!response.ok) {
    throw new Error('無法載入請款單母版檔案');
  }

  const templateBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

  // 1. 更新主工作表：xl/worksheets/sheet1.xml
  const sheet1Entry = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet1Entry) {
    throw new Error('母版中找不到 xl/worksheets/sheet1.xml');
  }
  let sheet1Xml = await sheet1Entry.async('text');

  // 公司名稱 (H1)
  sheet1Xml = updateSheetCell(sheet1Xml, 'H1', data.company);

  // 申請日 (V3, Y3, AB3) -> 民國年
  const applyDateParts = parseDateParts(data.applyDate);
  if (applyDateParts) {
    sheet1Xml = updateSheetCell(sheet1Xml, 'V3', applyDateParts.rocYear, 'number');
    sheet1Xml = updateSheetCell(sheet1Xml, 'Y3', applyDateParts.month, 'number');
    sheet1Xml = updateSheetCell(sheet1Xml, 'AB3', applyDateParts.day, 'number');
  } else {
    sheet1Xml = updateSheetCell(sheet1Xml, 'V3', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'Y3', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'AB3', null);
  }

  // 專案代號/名稱 (E5)
  sheet1Xml = updateSheetCell(sheet1Xml, 'E5', data.project);

  // 請購單編號 (I5)
  sheet1Xml = updateSheetCell(sheet1Xml, 'I5', data.requisitionNumber);

  // 受款人/廠商 (N5)
  const vendorDisplay = data.vendorTaxId?.trim()
    ? `${data.vendor}（統編：${data.vendorTaxId.trim()}）`
    : data.vendor;
  sheet1Xml = updateSheetCell(sheet1Xml, 'N5', vendorDisplay);

  // 費用歸屬部門 (E7)
  sheet1Xml = updateSheetCell(sheet1Xml, 'E7', data.department);

  // 合約/訂購單編號 (I7)
  sheet1Xml = updateSheetCell(sheet1Xml, 'I7', data.contractNumber);

  // 受款人/廠商匯款帳號 (N7)
  const formattedBank = formatPaymentBankAccount(data);
  sheet1Xml = updateSheetCell(sheet1Xml, 'N7', formattedBank);

  // 費用性質 (E10)
  sheet1Xml = updateSheetCell(sheet1Xml, 'E10', data.expenseNature);

  // 合約/訂購單總額 (I10) -> 設為 style 92（千分位）
  const parsedContractTotal = data.contractTotal ? parseFloat(data.contractTotal.replace(/,/g, '')) : null;
  sheet1Xml = updateSheetCell(sheet1Xml, 'I10', parsedContractTotal, 'number', '92');

  // 付款到期日 (N10, Q10, T10) -> 民國年
  const dueDateParts = parseDateParts(data.dueDate);
  if (dueDateParts) {
    sheet1Xml = updateSheetCell(sheet1Xml, 'N10', dueDateParts.rocYear, 'number');
    sheet1Xml = updateSheetCell(sheet1Xml, 'Q10', dueDateParts.month, 'number');
    sheet1Xml = updateSheetCell(sheet1Xml, 'T10', dueDateParts.day, 'number');
  } else {
    sheet1Xml = updateSheetCell(sheet1Xml, 'N10', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'Q10', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'T10', null);
  }

  // 付款明細（本期）
  // H13: (1) 請款/驗收/預付額
  const parsedCurrentAmount = data.currentAmount ? parseFloat(data.currentAmount.replace(/,/g, '')) : null;
  sheet1Xml = updateSheetCell(sheet1Xml, 'H13', parsedCurrentAmount, 'number');
  // I13: (2) 保留金額
  const parsedRetentionAmount = data.retentionAmount ? parseFloat(data.retentionAmount.replace(/,/g, '')) : null;
  sheet1Xml = updateSheetCell(sheet1Xml, 'I13', parsedRetentionAmount, 'number');
  // L13: (3) 預付款沖銷
  const parsedAdvanceDeduction = data.advanceDeduction ? parseFloat(data.advanceDeduction.replace(/,/g, '')) : null;
  sheet1Xml = updateSheetCell(sheet1Xml, 'L13', parsedAdvanceDeduction, 'number');
  // N13: (4) 罰扣（折讓金額）
  const parsedPenaltyDiscount = data.penaltyDiscount ? parseFloat(data.penaltyDiscount.replace(/,/g, '')) : null;
  sheet1Xml = updateSheetCell(sheet1Xml, 'N13', parsedPenaltyDiscount, 'number');
  // 注意：T13 是原生公式 =H13-I13-L13-N13，T15 同樣為公式，updateSheetCell 含有公式防禦會主動保留！

  // 計算實付金額
  const payable = calculatePayableAmount(
    data.currentAmount,
    data.retentionAmount,
    data.advanceDeduction,
    data.penaltyDiscount
  );

  // 預算管理動態連動做動：
  // I17: 合約金額/預算金額 -> 連動合約總額 =I10，快取值 parsedContractTotal，style 92（千分位）
  sheet1Xml = updateSheetCellFormula(sheet1Xml, 'I17', '=I10', parsedContractTotal, '92');
  // I18: 累計實支金額 -> 連動本期實付 =T13，快取值 payable，style 92（千分位）
  sheet1Xml = updateSheetCellFormula(sheet1Xml, 'I18', '=T13', payable, '92');
  // M17: 餘額或超支 -> 連動 =I17-I18，快取值 (parsedContractTotal - payable)，style 92（千分位）
  const remainingBudget = (parsedContractTotal !== null ? parsedContractTotal : 0) - payable;
  sheet1Xml = updateSheetCellFormula(sheet1Xml, 'M17', '=I17-I18', remainingBudget, '92');

  // 遠期支票兌現條件呈現（Row 21：J21:M21, N21, O21, P21, Q21, R21, S21, T21:X21）
  const sr = data.specialRequirements;
  if (sr.postDatedCheck) {
    if (sr.chequeTimingMode === 'immediate') {
      // 即期模式：J21 呈現「請付遠期支票予受款者－即期」，清空後續年月日與付予支票文字
      sheet1Xml = updateSheetCell(sheet1Xml, 'J21', '請付遠期支票予受款者－即期');
      sheet1Xml = updateSheetCell(sheet1Xml, 'N21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'O21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'P21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'R21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'S21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'T21', null);
    } else if (sr.chequeTimingMode === 'days' && sr.chequeDays) {
      // 天數模式：J21 呈現「請付遠期支票予受款者－N 天」，清空後續年月日與付予支票文字
      sheet1Xml = updateSheetCell(sheet1Xml, 'J21', `請付遠期支票予受款者－${sr.chequeDays} 天`);
      sheet1Xml = updateSheetCell(sheet1Xml, 'N21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'O21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'P21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'R21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'S21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'T21', null);
    } else if (sr.postDatedDate) {
      // 指定兌現日期模式（含舊資料無 mode 但有 postDatedDate）：填入 N21(年), P21(月), R21(日)
      sheet1Xml = updateSheetCell(sheet1Xml, 'J21', '請付遠期支票予受款者，並於');
      const postParts = parseDateParts(sr.postDatedDate);
      if (postParts) {
        sheet1Xml = updateSheetCell(sheet1Xml, 'N21', postParts.rocYear, 'number');
        sheet1Xml = updateSheetCell(sheet1Xml, 'P21', postParts.month, 'number');
        sheet1Xml = updateSheetCell(sheet1Xml, 'R21', postParts.day, 'number');
      } else {
        sheet1Xml = updateSheetCell(sheet1Xml, 'N21', null);
        sheet1Xml = updateSheetCell(sheet1Xml, 'P21', null);
        sheet1Xml = updateSheetCell(sheet1Xml, 'R21', null);
      }
      sheet1Xml = updateSheetCell(sheet1Xml, 'O21', '年');
      sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', '月');
      sheet1Xml = updateSheetCell(sheet1Xml, 'S21', '日');
      sheet1Xml = updateSheetCell(sheet1Xml, 'T21', '付予支票。');
    } else {
      sheet1Xml = updateSheetCell(sheet1Xml, 'J21', '請付遠期支票予受款者');
      sheet1Xml = updateSheetCell(sheet1Xml, 'N21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'O21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'P21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'R21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'S21', null);
      sheet1Xml = updateSheetCell(sheet1Xml, 'T21', null);
    }
  } else {
    // 未勾選遠期支票：保持母版預設狀態
    sheet1Xml = updateSheetCell(sheet1Xml, 'J21', '請付遠期支票予受款者，並於');
    sheet1Xml = updateSheetCell(sheet1Xml, 'N21', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'O21', '年');
    sheet1Xml = updateSheetCell(sheet1Xml, 'P21', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', '月');
    sheet1Xml = updateSheetCell(sheet1Xml, 'R21', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'S21', '日');
    sheet1Xml = updateSheetCell(sheet1Xml, 'T21', '付予支票。');
  }

  // 請款說明：先清空 G22:G37 全區
  sheet1Xml = clearCellRange(sheet1Xml, 'G', 22, 37);

  // 依行寫入請款說明（最多 16 列 G22..G37）
  const descLines = data.description.split('\n');
  const maxRows = 16;
  for (let i = 0; i < Math.min(descLines.length, maxRows); i++) {
    const rowNum = 22 + i;
    let lineContent = descLines[i];
    if (i === maxRows - 1 && descLines.length > maxRows) {
      lineContent = descLines.slice(maxRows - 1).join('\n');
    }
    sheet1Xml = updateSheetCell(sheet1Xml, `G${rowNum}`, lineContent);
  }

  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

  // 2. 更新核取方塊：
  // A. VML 繪圖物件：xl/drawings/vmlDrawing1.vml
  const vmlEntry = zip.file('xl/drawings/vmlDrawing1.vml');
  if (vmlEntry) {
    let vmlXml = await vmlEntry.async('text');

    const shapeCheckboxMap: Record<string, boolean> = {
      '_x0000_s57345': data.specialRequirements.noCross,         // 請勿劃線
      '_x0000_s57346': data.specialRequirements.noEndorse,       // 請勿禁止背書轉讓
      '_x0000_s57347': data.specialRequirements.cashiersCheck,   // 請開立銀行本票/台銀支票
      '_x0000_s57348': data.specialRequirements.postDatedCheck,  // 請付遠期支票予受款者
      '_x0000_s57349': data.specialRequirements.wireTransfer,    // 請以匯款支付
      '_x0000_s57350': data.specialRequirements.offsetBorrowing, // 請沖銷借支款
    };

    for (const [shapeId, isChecked] of Object.entries(shapeCheckboxMap)) {
      const shapeRegex = new RegExp(`(<v:shape[^>]*id="${shapeId}"[\\s\\S]*?<\\/v:shape>)`, 'g');
      vmlXml = vmlXml.replace(shapeRegex, (match) => {
        let cleaned = match.replace(/<x:Checked>\d+<\/x:Checked>\s*/g, '');
        if (isChecked) {
          cleaned = cleaned.replace('</x:ClientData>', '   <x:Checked>1</x:Checked>\n  </x:ClientData>');
        }
        return cleaned;
      });
    }

    zip.file('xl/drawings/vmlDrawing1.vml', vmlXml);
  }

  // B. OpenXML 控制項屬性：xl/ctrlProps/ctrlProp1.xml ~ ctrlProp6.xml（Excel 2010+ 關鍵設定）
  const ctrlPropMap: Record<string, boolean> = {
    'xl/ctrlProps/ctrlProp1.xml': Boolean(data.specialRequirements.noCross),         // Check Box 1: 請勿劃線
    'xl/ctrlProps/ctrlProp2.xml': Boolean(data.specialRequirements.noEndorse),       // Check Box 2: 請勿禁止背書轉讓
    'xl/ctrlProps/ctrlProp3.xml': Boolean(data.specialRequirements.cashiersCheck),   // Check Box 3: 請開立銀行本票/台銀支票
    'xl/ctrlProps/ctrlProp4.xml': Boolean(data.specialRequirements.postDatedCheck),  // Check Box 4: 請付遠期支票
    'xl/ctrlProps/ctrlProp5.xml': Boolean(data.specialRequirements.wireTransfer),    // Check Box 5: 請以匯款支付
    'xl/ctrlProps/ctrlProp6.xml': Boolean(data.specialRequirements.offsetBorrowing), // Check Box 6: 請沖銷借支款
  };

  for (const [ctrlPath, isChecked] of Object.entries(ctrlPropMap)) {
    const ctrlEntry = zip.file(ctrlPath);
    if (ctrlEntry) {
      let ctrlXml = await ctrlEntry.async('text');
      // 清除舊 checked 屬性
      ctrlXml = ctrlXml.replace(/\s+checked="[^"]*"/g, '');
      if (isChecked) {
        ctrlXml = ctrlXml.replace('<formControlPr ', '<formControlPr checked="Checked" ');
      }
      zip.file(ctrlPath, ctrlXml);
    }
  }

  // 3. 輸出為 XLSX 二進位檔
  const outputBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });

  return outputBlob;
}
