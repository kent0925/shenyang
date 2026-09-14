import JSZip from 'jszip';
import { PaymentRequestData } from '../../models/paymentRequest';
import { parseDateParts } from '../../utils/date';
import { formatBankAccount } from '../../utils/format';
import { clearCellRange, updateSheetCell } from './ooxmlHelper';

/**
 * 產生請款單 XLSX 檔案
 * 核心保證：
 * 1. 嚴格保留原始公式（如 T13: =H13-I13-L13-N13, T15 等），禁止覆寫任何公式儲存格
 * 2. 說明 G22:G37 全區先清除再填入，避免舊資料殘留
 * 3. 準確設定 VML 表單控制項之核取方塊狀態
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
  sheet1Xml = updateSheetCell(sheet1Xml, 'N5', data.vendor);

  // 費用歸屬部門 (E7)
  sheet1Xml = updateSheetCell(sheet1Xml, 'E7', data.department);

  // 合約/訂購單編號 (I7)
  sheet1Xml = updateSheetCell(sheet1Xml, 'I7', data.contractNumber);

  // 受款人/廠商匯款帳號 (N7)
  const formattedBank = formatBankAccount(data.bankAccount);
  sheet1Xml = updateSheetCell(sheet1Xml, 'N7', formattedBank);

  // 費用性質 (E10)
  sheet1Xml = updateSheetCell(sheet1Xml, 'E10', data.expenseNature);

  // 合約/訂購單總額 (I10)
  sheet1Xml = updateSheetCell(sheet1Xml, 'I10', data.contractTotal ? parseFloat(data.contractTotal.replace(/,/g, '')) : null, 'number');

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
  sheet1Xml = updateSheetCell(sheet1Xml, 'H13', data.currentAmount ? parseFloat(data.currentAmount.replace(/,/g, '')) : null, 'number');
  // I13: (2) 保留金額
  sheet1Xml = updateSheetCell(sheet1Xml, 'I13', data.retentionAmount ? parseFloat(data.retentionAmount.replace(/,/g, '')) : null, 'number');
  // L13: (3) 預付款沖銷
  sheet1Xml = updateSheetCell(sheet1Xml, 'L13', data.advanceDeduction ? parseFloat(data.advanceDeduction.replace(/,/g, '')) : null, 'number');
  // N13: (4) 罰扣（折讓金額）
  sheet1Xml = updateSheetCell(sheet1Xml, 'N13', data.penaltyDiscount ? parseFloat(data.penaltyDiscount.replace(/,/g, '')) : null, 'number');
  // 注意：T13 是原生公式 =H13-I13-L13-N13，T15 同樣為公式，updateSheetCell 會主動忽略保護！

  // 遠期支票到期日 (O21, Q21, S21)
  if (data.specialRequirements.postDatedCheck && data.specialRequirements.postDatedDate) {
    const postParts = parseDateParts(data.specialRequirements.postDatedDate);
    if (postParts) {
      sheet1Xml = updateSheetCell(sheet1Xml, 'O21', postParts.rocYear, 'number');
      sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', postParts.month, 'number');
      sheet1Xml = updateSheetCell(sheet1Xml, 'S21', postParts.day, 'number');
    }
  } else {
    sheet1Xml = updateSheetCell(sheet1Xml, 'O21', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'Q21', null);
    sheet1Xml = updateSheetCell(sheet1Xml, 'S21', null);
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

  // 2. 更新核取方塊：xl/drawings/vmlDrawing1.vml
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
        // 先移除可能已有的 <x:Checked>...</x:Checked>
        let cleaned = match.replace(/<x:Checked>\d+<\/x:Checked>\s*/g, '');
        if (isChecked) {
          // 在 </x:ClientData> 前插入 <x:Checked>1</x:Checked>
          cleaned = cleaned.replace('</x:ClientData>', '   <x:Checked>1</x:Checked>\n  </x:ClientData>');
        }
        return cleaned;
      });
    }

    zip.file('xl/drawings/vmlDrawing1.vml', vmlXml);
  }

  // 3. 輸出為 XLSX 二進位檔
  const outputBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });

  return outputBlob;
}
