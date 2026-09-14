/**
 * OOXML XML 操作輔助工具
 * 直接操作 XML 字串與 DOM，確保不改動 workbook 結構與 VBA 二進位檔案
 */

// XML 特殊字元跳脫
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
 * 取得儲存格的欄位英文字母與列號，例如 "C5" -> { col: "C", row: 5 }
 */
export function parseCellRef(cellRef: string): { col: string; row: number } {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell ref: ${cellRef}`);
  return { col: match[1], row: parseInt(match[2], 10) };
}

/**
 * 將欄位字母轉換為數字進行比較，例如 "A" -> 1, "Z" -> 26, "AA" -> 27
 */
export function colToNumber(col: string): number {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

/**
 * 在 Sheet XML 字串中安全更新或清空指定儲存格
 * - 若 cell 含有 <f> 公式，一律保護不覆寫
 * - 若 value 為 null 或 undefined 或空字串，則清空內容（保留原有樣式 s 屬性）
 * - 文字類型使用 inlineStr，安全獨立，不破壞 sharedStrings
 * - 數字類型使用 <v>123</v>
 */
export function updateSheetCell(
  sheetXml: string,
  cellRef: string,
  value: string | number | null | undefined,
  type: 'string' | 'number' = 'string'
): string {
  const { row } = parseCellRef(cellRef);
  const rowRegex = new RegExp(`(<row[^>]*r="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  const rowMatch = sheetXml.match(rowRegex);

  if (!rowMatch) {
    // 如果找不到該 row，目前母版中所有目標列皆已存在，直接返回
    return sheetXml;
  }

  const rowOpen = rowMatch[1];
  let rowContent = rowMatch[2];
  const rowClose = rowMatch[3];

  const cellRegex = new RegExp(`(<c[^>]*r="${cellRef}"[^>]*>)([\\s\\S]*?)(<\\/c>)|(<c[^>]*r="${cellRef}"[^>]*\\/>)`);
  const cellMatch = rowContent.match(cellRegex);

  // 檢查是否為公式儲存格，若含有公式則嚴格保留不覆寫
  if (cellMatch && cellMatch[0].includes('<f>')) {
    return sheetXml;
  }

  // 提取原有樣式屬性 s=".."
  let styleAttr = '';
  if (cellMatch) {
    const sMatch = cellMatch[0].match(/s="(\d+)"/);
    if (sMatch) {
      styleAttr = ` s="${sMatch[1]}"`;
    }
  }

  let newCellXml = '';
  if (value === null || value === undefined || value === '') {
    // 清空儲存格內容，保留樣式
    newCellXml = `<c r="${cellRef}"${styleAttr}/>`;
  } else if (type === 'number') {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(numVal)) {
      newCellXml = `<c r="${cellRef}"${styleAttr}/>`;
    } else {
      newCellXml = `<c r="${cellRef}"${styleAttr}><v>${numVal}</v></c>`;
    }
  } else {
    // string 類型：使用標準 inlineStr
    const escaped = escapeXml(String(value));
    newCellXml = `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
  }

  if (cellMatch) {
    // 替換原有 cell
    rowContent = rowContent.replace(cellMatch[0], newCellXml);
  } else {
    // 若原 row 內沒有這個 cell，按欄位順序插入
    const targetColNum = colToNumber(parseCellRef(cellRef).col);
    const existingCells = Array.from(rowContent.matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>.*?<\/c>|<c[^>]*r="([A-Z]+)\d+"[^>]*\/>/gs));

    let inserted = false;
    for (const ec of existingCells) {
      const existingCol = ec[1] || ec[2];
      if (colToNumber(existingCol) > targetColNum) {
        const idx = rowContent.indexOf(ec[0]);
        rowContent = rowContent.substring(0, idx) + newCellXml + rowContent.substring(idx);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      rowContent += newCellXml;
    }
  }

  const updatedRow = `${rowOpen}${rowContent}${rowClose}`;
  return sheetXml.replace(rowMatch[0], updatedRow);
}

/**
 * 批次清空一個範圍的儲存格，例如 B7..B23
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
