import JSZip from 'jszip';
import { RAW_MASTER_CLAIM_CSV, parseCsvRows } from '../../data/masterClaimData';
import { downloadBlob } from '../../utils/fileBlob';

/**
 * 下載母表原始 CSV 檔案（100% 原文，帶 UTF-8 BOM 確保 Excel 開啟不亂碼）
 */
export function downloadMasterClaimCsv(): void {
  // UTF-8 BOM: \uFEFF
  const bom = '\uFEFF';
  const blob = new Blob([bom + RAW_MASTER_CLAIM_CSV], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, '每月及年度請款總表_母表.csv');
}

/**
 * 欄位索引轉 Excel 欄名 (0 -> A, 27 -> AB)
 */
function colIndexToName(colIdx: number): string {
  let name = '';
  let n = colIdx;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 建立一個乾淨、包含母表全部資料的標準 Excel (.xlsx) 檔案
 */
export async function generateMasterClaimExcelBlob(): Promise<Blob> {
  const zip = new JSZip();
  const rows = parseCsvRows(RAW_MASTER_CLAIM_CSV);

  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
  );

  // 2. _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  // 3. xl/_rels/workbook.xml.rels
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  // 4. xl/workbook.xml
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="每月及年度請款總表母表" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
  );

  // 5. xl/styles.xml (定義常用字型、邊框、填滿、對齊方式)
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="10"/><name val="Microsoft JhengHei"/></font>
    <font><b/><sz val="10"/><name val="Microsoft JhengHei"/></font>
    <font><b/><sz val="12"/><color rgb="FF1E3A8A"/><name val="Microsoft JhengHei"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`
  );

  // 6. xl/worksheets/sheet1.xml
  let sheetDataXml = '<sheetData>';

  rows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 1;
    let rowXml = `<row r="${rowNum}" spans="1:${Math.max(row.length, 30)}">`;

    row.forEach((cellVal, colIdx) => {
      const cellRef = `${colIndexToName(colIdx)}${rowNum}`;
      if (cellVal === null || cellVal === undefined || cellVal === '') {
        // 空值可略過或寫入空儲存格
        return;
      }

      const trimmed = cellVal.trim();
      const num = Number(trimmed);
      const isNumeric = trimmed !== '' && !isNaN(num) && !trimmed.startsWith('0');

      // 判斷樣式
      let styleId = 0;
      if (rowNum <= 3 || row[0]?.includes('總結') || cellVal === '公司' || cellVal === '專案') {
        styleId = 1;
      } else if (cellVal.includes('藍色=本月新增項目') || cellVal.includes('製表時間')) {
        styleId = 3;
      }

      if (isNumeric) {
        rowXml += `<c r="${cellRef}" s="${styleId}"><v>${num}</v></c>`;
      } else {
        const escaped = escapeXml(cellVal);
        rowXml += `<c r="${cellRef}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
      }
    });

    rowXml += '</row>';
    sheetDataXml += rowXml;
  });

  sheetDataXml += '</sheetData>';

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:AD${rows.length}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>
    <col min="1" max="1" width="12" customWidth="1"/>
    <col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="3" width="26" customWidth="1"/>
    <col min="4" max="4" width="26" customWidth="1"/>
    <col min="5" max="6" width="16" customWidth="1"/>
    <col min="7" max="9" width="14" customWidth="1"/>
    <col min="10" max="35" width="13" customWidth="1"/>
  </cols>
  ${sheetDataXml}
</worksheet>`;

  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * 下載母表完整 Excel (.xlsx) 檔案
 */
export async function downloadMasterClaimExcel(): Promise<void> {
  const blob = await generateMasterClaimExcelBlob();
  downloadBlob(blob, '每月及年度請款總表_母表.xlsx');
}
