import JSZip from 'jszip';
import { SealApprovalData } from '../../models/sealApproval';
import { formatDateSlash } from '../../utils/date';
import { clearCellRange, updateSheetCell } from './ooxmlHelper';

/**
 * 產生用印／簽呈 XLSM 檔案
 * 核心保證：
 * 1. 絕不重建 Workbook，直接在母版 ZIP 上做微量 OOXML 更新
 * 2. 嚴格保留 xl/vbaProject.bin（SHA-256 不變），確保巨集與隱藏工作表完好
 * 3. 每次產生時，說明 B7:B23 全區先清空再填入，避免舊資料殘留
 * 4. 根據實測 VBA 邏輯連動更新工具頁 A1:A3 的相機投影來源狀態
 */
export async function generateSealApprovalExcel(data: SealApprovalData): Promise<Blob> {
  const response = await fetch('/templates/用印及簽核表單-含小家.xlsm');
  if (!response.ok) {
    throw new Error('無法載入用印及簽核表單母版檔案');
  }

  const templateBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

  // 1. 更新主工作表：xl/worksheets/sheet1.xml
  const sheet1Entry = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet1Entry) {
    throw new Error('母版中找不到 xl/worksheets/sheet1.xml');
  }
  let sheet1Xml = await sheet1Entry.async('text');

  // 公司名稱 (B1)
  sheet1Xml = updateSheetCell(sheet1Xml, 'B1', data.company);

  // 申請日 (I5)
  sheet1Xml = updateSheetCell(sheet1Xml, 'I5', formatDateSlash(data.applyDate));

  // 主旨 (C5)
  sheet1Xml = updateSheetCell(sheet1Xml, 'C5', data.subject);

  // 說明：先清空 B7:B23 全區
  sheet1Xml = clearCellRange(sheet1Xml, 'B', 7, 23);

  // 依行寫入說明文字（最多 17 列 B7..B23）
  const descLines = data.description.split('\n');
  const maxRows = 17;
  for (let i = 0; i < Math.min(descLines.length, maxRows); i++) {
    const rowNum = 7 + i;
    let lineContent = descLines[i];
    // 若超過 17 行，將剩餘內容合併至第 23 列
    if (i === maxRows - 1 && descLines.length > maxRows) {
      lineContent = descLines.slice(maxRows - 1).join('\n');
    }
    sheet1Xml = updateSheetCell(sheet1Xml, `B${rowNum}`, lineContent);
  }

  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

  // 2. 更新工具頁：xl/worksheets/sheet2.xml
  // VBA 實測行為：A1=簽呈, A2=用印, A3=借印；打勾為 "R"，未打勾為 "£"
  const sheet2Entry = zip.file('xl/worksheets/sheet2.xml');
  if (sheet2Entry) {
    let sheet2Xml = await sheet2Entry.async('text');
    const isQianCheng = data.types.includes('簽呈');
    const isYongYin = data.types.includes('用印');
    const isJieYin = data.types.includes('借印');

    sheet2Xml = updateSheetCell(sheet2Xml, 'A1', isQianCheng ? 'R' : '£');
    sheet2Xml = updateSheetCell(sheet2Xml, 'A2', isYongYin ? 'R' : '£');
    sheet2Xml = updateSheetCell(sheet2Xml, 'A3', isJieYin ? 'R' : '£');

    zip.file('xl/worksheets/sheet2.xml', sheet2Xml);
  }

  // 3. 輸出為 XLSM 二進位檔
  const outputBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    compression: 'DEFLATE',
  });

  return outputBlob;
}
