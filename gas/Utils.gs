/**
 * Utils.gs - 工具函式庫
 * 
 * 包含：
 * 1. 試算表地區與時區設定 (zh_TW, Asia/Taipei)
 * 2. 工作表中文標頭初始化與平滑升級 (英文 Header -> 中文 Header)
 * 3. 欄位格式化（純文字、數值千分位、yyyy/MM/dd、yyyy/MM/dd HH:mm:ss）
 * 4. 預設空白工作表清理
 * 5. JavaScript 原生 Date 物件產生
 */

/**
 * 套用試算表全域設定（Locale = zh_TW, TimeZone = Asia/Taipei）
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet 試算表物件
 */
function applySpreadsheetSettings(spreadsheet) {
  if (!spreadsheet) return;

  try {
    if (spreadsheet.setSpreadsheetLocale) {
      spreadsheet.setSpreadsheetLocale('zh_TW');
    }
  } catch (e) {
    Logger.log('設定 Spreadsheet Locale 警告: ' + e.message);
  }

  try {
    if (spreadsheet.setSpreadsheetTimeZone) {
      spreadsheet.setSpreadsheetTimeZone('Asia/Taipei');
    }
  } catch (e) {
    Logger.log('設定 Spreadsheet TimeZone 警告: ' + e.message);
  }
}

/**
 * 設定工作表標頭與欄位資料格式
 * 支援自動升級：若檢測到第一列為舊版英文 Key，自動平滑升級為中文 Header，保留後續所有資料列！
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 目標工作表
 * @param {Object} schema 表格結構定義 (包含 columns: [{ key, label, type }])
 */
function setupSheetStructure(sheet, schema) {
  if (!sheet || !schema || !schema.columns) {
    return;
  }

  var columns = schema.columns;
  var headers = columns.map(function (c) { return c.label; });
  var keys = columns.map(function (c) { return c.key; });

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  // 若工作表為全新空白，或無內容
  if (lastRow === 0 || lastCol === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // 檢查現有第一列內容
    var existingHeaders = sheet.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
    var isBlankHeader = existingHeaders.every(function (val) {
      return val === '' || val === null || val === undefined;
    });

    // 檢查是否包含舊版英文 Key
    var isEnglishOrOldHeader = existingHeaders.some(function (val) {
      return keys.indexOf(String(val).trim()) !== -1;
    });

    // 若為空白或舊版英文 Header，平滑升級第一列為中文 Header（不影響後續資料）
    if (isBlankHeader || isEnglishOrOldHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  // 凍結第一列
  sheet.setFrozenRows(1);

  // Header 格式：加粗
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  // 確保工作表至少有 100 列可供設定格式
  var maxRows = sheet.getMaxRows();
  if (maxRows < 100) {
    sheet.insertRowsAfter(maxRows, 100 - maxRows);
    maxRows = sheet.getMaxRows();
  }
  var formatRowCount = Math.max(maxRows - 1, 1);

  // 設定各欄位的資料格式
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i];
    var colIndex = i + 1;
    var columnRange = sheet.getRange(2, colIndex, formatRowCount, 1);

    switch (col.type) {
      case 'text':
        // 純文字格式：防範統編、銀行帳號、代碼等前置 0 遺失
        columnRange.setNumberFormat('@');
        break;
      case 'number':
        // 數值千分位格式
        columnRange.setNumberFormat('#,##0');
        break;
      case 'date':
        // 台灣標準一般日期格式
        columnRange.setNumberFormat('yyyy/MM/dd');
        break;
      case 'datetime':
        // 台灣標準日期時間格式
        columnRange.setNumberFormat('yyyy/MM/dd HH:mm:ss');
        break;
      default:
        // json, boolean 等維持一般格式
        break;
    }
  }

  // 自動調整欄寬（以 header 欄數為範圍）
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }

  // 舊日期資料 Migration：將可解析之 ISO 字串平滑轉換為 JavaScript Date 物件
  migrateDateCells(sheet, schema);
}

/**
 * 檢查並將既有資料列中的 ISO 日期字串平滑轉換為 JavaScript 原生 Date 物件
 * 規則：
 * 1. 僅處理 schema 定義為 date 或 datetime 的欄位。
 * 2. 僅轉換可解析的 ISO 日期字串，空白值不處理。
 * 3. 已經是原生 Date 或數值 serial 者不變動。
 * 4. 具備冪等性，重複執行不會重複轉換或影響已轉換的值。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 目標工作表
 * @param {Object} schema 表格結構定義
 */
function migrateDateCells(sheet, schema) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var columns = schema.columns;
  var dateColIndices = [];
  for (var i = 0; i < columns.length; i++) {
    if (columns[i].type === 'date' || columns[i].type === 'datetime') {
      dateColIndices.push(i + 1);
    }
  }

  if (dateColIndices.length === 0) return;

  var numRows = lastRow - 1;
  var dataRange = sheet.getRange(2, 1, numRows, columns.length);
  var values = dataRange.getValues();
  var hasChanges = false;

  for (var r = 0; r < numRows; r++) {
    for (var c = 0; c < dateColIndices.length; c++) {
      var colIdx0 = dateColIndices[c] - 1;
      var cellVal = values[r][colIdx0];

      if (typeof cellVal === 'string') {
        var trimmed = cellVal.trim();
        if (trimmed !== '' && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
          var parsedTime = Date.parse(trimmed);
          if (!isNaN(parsedTime)) {
            values[r][colIdx0] = new Date(parsedTime);
            hasChanges = true;
          }
        }
      }
    }
  }

  if (hasChanges) {
    dataRange.setValues(values);
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
 * 取得目前時間的 JavaScript Date 物件（供直接寫入試算表日期/時間欄位）
 * 禁止使用純 ISO 字串當正式 Sheet 日期值
 * @return {Date}
 */
function getCurrentTimestamp() {
  return new Date();
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
