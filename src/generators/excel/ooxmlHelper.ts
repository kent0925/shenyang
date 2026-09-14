/**
 * OOXML XML 操作輔助工具
 * 使用字元索引進行無副作用、精確儲存格定位與替換
 * 徹底解決正則表達式貪婪跨標籤問題，確保相鄰與後續儲存格絕不被誤吞
 */

export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 精確更新 Sheet XML 中的指定儲存格
 * - 嚴格保護公式儲存格（含有 <f> 則不覆寫）
 * - 絕不吃掉其他儲存格
 * - 支援保留原有樣式 s 屬性
 */
export function updateSheetCell(
  sheetXml: string,
  cellRef: string,
  value: string | number | null | undefined,
  type: 'string' | 'number' = 'string'
): string {
  const rAttr = `r="${cellRef}"`;
  const idx = sheetXml.indexOf(rAttr);
  if (idx === -1) {
    return sheetXml;
  }

  // 往前定位儲存格起始標籤 <c
  const cellStart = sheetXml.lastIndexOf('<c', idx);
  if (cellStart === -1) return sheetXml;

  // 往後定位儲存格結束標籤
  const closeSlash = sheetXml.indexOf('/>', idx);
  const closeTag = sheetXml.indexOf('</c>', idx);

  let cellEnd = -1;
  let isSelfClosing = false;

  if (closeSlash !== -1 && (closeTag === -1 || closeSlash < closeTag)) {
    const firstGt = sheetXml.indexOf('>', idx);
    if (firstGt === closeSlash + 1) {
      cellEnd = closeSlash + 2;
      isSelfClosing = true;
    }
  }

  if (!isSelfClosing) {
    if (closeTag === -1) return sheetXml;
    cellEnd = closeTag + 4;
  }

  const rawCell = sheetXml.substring(cellStart, cellEnd);

  // 公式保護：含有 <f> 者絕不覆寫
  if (rawCell.includes('<f>')) {
    return sheetXml;
  }

  // 提取原有樣式 s=".."
  let styleAttr = '';
  const sMatch = rawCell.match(/\bs="(\d+)"/);
  if (sMatch) {
    styleAttr = ` s="${sMatch[1]}"`;
  }

  let newCellXml = '';
  if (value === null || value === undefined || value === '') {
    newCellXml = `<c r="${cellRef}"${styleAttr}/>`;
  } else if (type === 'number') {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) {
      newCellXml = `<c r="${cellRef}"${styleAttr}/>`;
    } else {
      newCellXml = `<c r="${cellRef}"${styleAttr}><v>${num}</v></c>`;
    }
  } else {
    const escaped = escapeXml(String(value));
    newCellXml = `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
  }

  return sheetXml.substring(0, cellStart) + newCellXml + sheetXml.substring(cellEnd);
}

/**
 * 批次清空一個範圍的儲存格，例如 G22..G37
 */
export function clearCellRange(
  sheetXml: string,
  colLetter: string,
  startRow: number,
  endRow: number
): string {
  let xml = sheetXml;
  for (let r = startRow; r <= endRow; r++) {
    xml = updateSheetCell(xml, `${colLetter}${r}`, null);
  }
  return xml;
}
