/**
 * YearService.gs - 年度資料庫管理服務
 * 
 * 核心功能：
 * 1. createYearDatabase(year)：動態建立特定年度資料庫（如「2026公司表單資料庫」、「2027公司表單資料庫」）
 * 2. 包含工作表：預算項目、表單紀錄、請款紀錄、付款紀錄、異動紀錄
 * 3. 動態登記於主檔「年度設定」工作表，GAS 透過「年度設定」尋找年度 Spreadsheet，嚴禁寫死年度 ID。
 * 4. 保證冪等性（Idempotent），重複呼叫不會產生重複資料庫或重複工作表。
 */

/**
 * 取得年度資料庫檔案名稱
 * @param {number|string} year 西元年度
 * @return {string} 例如 "2026公司表單資料庫"
 */
function getYearDatabaseName(year) {
  return String(year) + CONFIG_DEFAULTS.YEAR_DATABASE_SUFFIX;
}

/**
 * 於主檔「年度設定」中查詢特定年度紀錄
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} masterSs 主檔試算表
 * @param {number|string} year 西元年度
 * @return {Object|null} 包含 rowIndex, year, spreadsheetId, status, createdAt, archivedAt
 */
function findYearRecordInMaster(masterSs, year) {
  var configSheet = masterSs.getSheetByName(SHEETS.YEAR_CONFIG);
  if (!configSheet) {
    return null;
  }

  var data = configSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return null;
  }

  var targetYearStr = String(year).trim();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[0]).trim() === targetYearStr) {
      return {
        rowIndex: i + 1,
        year: String(row[0]).trim(),
        spreadsheetId: String(row[1]).trim(),
        status: String(row[2]).trim(),
        createdAt: row[3],
        archivedAt: row[4],
      };
    }
  }

  return null;
}

/**
 * 取得特定年度的 Spreadsheet 物件
 * 透過主檔「年度設定」工作表動態定位，禁止寫死年度 Spreadsheet ID
 * @param {number|string} year 西元年度
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet|null}
 */
function getYearDatabase(year) {
  var masterSs = getMasterDatabase();
  var record = findYearRecordInMaster(masterSs, year);
  if (!record || !record.spreadsheetId) {
    return null;
  }

  try {
    return SpreadsheetApp.openById(record.spreadsheetId);
  } catch (e) {
    Logger.log('無法開啟年度 ' + year + ' 之 Spreadsheet (' + record.spreadsheetId + '): ' + e.message);
    return null;
  }
}

/**
 * 建立或取得指定年度資料庫（保證冪等性）
 * 包含：預算項目、表單紀錄、請款紀錄、付款紀錄、異動紀錄
 * @param {number|string} year 西元年度（例如 2026 或 2027）
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function createYearDatabase(year) {
  if (!year) {
    throw new Error('呼叫 createYearDatabase(year) 必須指定有效西元年度。');
  }

  var targetYear = parseInt(year, 10);
  if (isNaN(targetYear)) {
    throw new Error('年度必須為有效數值：' + year);
  }

  var masterSs = getMasterDatabase();
  var existingRecord = findYearRecordInMaster(masterSs, targetYear);
  var yearSs = null;

  // 1. 若「年度設定」已有紀錄，確認檔案是否正常存在
  if (existingRecord && existingRecord.spreadsheetId) {
    try {
      var file = DriveApp.getFileById(existingRecord.spreadsheetId);
      if (file && !file.isTrashed()) {
        yearSs = SpreadsheetApp.openById(existingRecord.spreadsheetId);
      }
    } catch (e) {
      Logger.log('既有年度紀錄之檔案無效或已移入垃圾桶，將重新連結或建立：' + e.message);
    }
  }

  // 2. 若無既有檔案或紀錄無效，至 Drive 目錄取得或建立（避免重複建檔）
  if (!yearSs) {
    var rootFolderId = getDriveRootFolderId();
    var dbName = getYearDatabaseName(targetYear);
    yearSs = getOrCreateSpreadsheetInFolder(rootFolderId, dbName);

    // 登記或更新至主檔「年度設定」工作表
    var configSheet = masterSs.getSheetByName(SHEETS.YEAR_CONFIG);
    if (existingRecord) {
      // 更新既有列的 spreadsheetId
      configSheet.getRange(existingRecord.rowIndex, 2).setValue(yearSs.getId());
      configSheet.getRange(existingRecord.rowIndex, 3).setValue(STATUS.YEAR.ACTIVE);
    } else {
      // 新增一列年度紀錄
      configSheet.appendRow([
        String(targetYear),
        yearSs.getId(),
        STATUS.YEAR.ACTIVE,
        getCurrentIsoTimestamp(),
        '',
      ]);
    }
  }

  // 3. 確保年度資料庫五大工作表完整存在並套用格式
  YEAR_SHEET_NAMES.forEach(function (sheetName) {
    getOrCreateSheet(yearSs, sheetName, SCHEMAS[sheetName]);
  });

  // 4. 清除新建試算表預設之空白工作表
  cleanupDefaultSheets(yearSs, YEAR_SHEET_NAMES);

  Logger.log('年度資料庫 [' + getYearDatabaseName(targetYear) + '] 準備就緒，ID: ' + yearSs.getId());
  return yearSs;
}
