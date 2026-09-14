/**
 * Utils.gs - 工具函式庫
 * 
 * 包含：
 * 1. 工作表結構初始化與格式化（純文字、數值、日期）
 * 2. 凍結列與 Header 格式
 * 3. 預設多餘空白工作表清理
 * 4. 日期時間格式化與輔助功能
 */

/**
 * 設定工作表標頭與欄位資料格式
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 目標工作表
 * @param {Object} schema 表格結構定義 (headers, textColumns, numberColumns, dateColumns)
 */
function setupSheetStructure(sheet, schema) {
  if (!sheet || !schema || !schema.headers) {
    return;
  }

  var headers = schema.headers;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  // 若工作表為全新空白，或無標頭
  if (lastRow === 0 || lastCol === 0) {
    // 寫入 Header
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // 若已存在第一列，檢查是否缺少標頭
    var existingHeaders = sheet.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
    var isBlankHeader = existingHeaders.every(function (val) {
      return val === '' || val === null || val === undefined;
    });
    if (isBlankHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  // 凍結第一列
  sheet.setFrozenRows(1);

  // Header 格式：加粗
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  // 確保工作表至少有 100 列可供格式化
  var maxRows = sheet.getMaxRows();
  if (maxRows < 100) {
    sheet.insertRowsAfter(maxRows, 100 - maxRows);
    maxRows = sheet.getMaxRows();
  }
  var formatRowCount = Math.max(maxRows - 1, 1);

  // 設定各欄位的資料格式
  for (var i = 0; i < headers.length; i++) {
    var colName = headers[i];
    var colIndex = i + 1;
    var columnRange = sheet.getRange(2, colIndex, formatRowCount, 1);

    if (schema.textColumns && schema.textColumns.indexOf(colName) !== -1) {
      // 純文字格式：防範統編、銀行帳號、代碼等前置 0 遺失
      columnRange.setNumberFormat('@');
    } else if (schema.numberColumns && schema.numberColumns.indexOf(colName) !== -1) {
      // 數值千分位格式
      columnRange.setNumberFormat('#,##0');
    } else if (schema.dateColumns && schema.dateColumns.indexOf(colName) !== -1) {
      // 標準日期格式
      columnRange.setNumberFormat('yyyy-MM-dd');
    }
  }

  // 自動調整欄寬（以 header 欄數為範圍）
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

/**
 * 取得或建立特定名稱的工作表，並套用 Schema 標頭與格式
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet 試算表物件
 * @param {string} sheetName 中文工作表名稱
 * @param {Object} schema 表格結構定義
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(spreadsheet, sheetName, schema) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  setupSheetStructure(sheet, schema);
  return sheet;
}

/**
 * 清除 Google Sheets 新建時預設產生的空白工作表（如「工作表1」或「Sheet1」）
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet 試算表物件
 * @param {Array<string>} validSheetNames 合法業務工作表名稱陣列
 */
function cleanupDefaultSheets(spreadsheet, validSheetNames) {
  var sheets = spreadsheet.getSheets();
  sheets.forEach(function (sheet) {
    var name = sheet.getName();
    if (validSheetNames.indexOf(name) === -1 && (name === '工作表1' || name === 'Sheet1')) {
      if (spreadsheet.getSheets().length > 1) {
        try {
          spreadsheet.deleteSheet(sheet);
        } catch (e) {
          // 忽略刪除失敗（例如僅剩一張工作表時不允許刪除）
        }
      }
    }
  });
}

/**
 * 格式化 ISO 日期時間字串 (YYYY-MM-DDTHH:mm:ss.sssZ)
 * @param {Date} [date] 日期物件，預設為當下
 * @return {string}
 */
function getCurrentIsoTimestamp(date) {
  var d = date || new Date();
  return d.toISOString();
}

/**
 * 產生簡易唯一碼 (可用於 Log ID 或暫時識別碼)
 * @param {string} prefix 前綴字
 * @return {string}
 */
function generateId(prefix) {
  var p = prefix ? prefix + '-' : '';
  var timestamp = new Date().getTime().toString(36);
  var randomPart = Math.random().toString(36).substring(2, 8);
  return (p + timestamp + '-' + randomPart).toUpperCase();
}
