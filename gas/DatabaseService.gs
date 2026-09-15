/**
 * DatabaseService.gs - 主檔資料庫與 Drive 試算表建立與管理
 * 
 * 核心原則：
 * 1. 冪等性（Idempotent）：重複執行不得產生重複 Spreadsheet（如「... (1)」）或重複 Sheet。
 * 2. 嚴禁寫死 Drive ID 或 Spreadsheet ID，由 Script Properties 與「年度設定」動態取得。
 * 3. 工作表名稱與 Header 使用繁體中文，內部 key 維持英文。
 * 4. 設定試算表 Locale = zh_TW, TimeZone = Asia/Taipei。
 */

/**
 * 在指定 Google Drive 資料夾中尋找指定名稱的有效檔案（排除垃圾桶檔案）
 * @param {GoogleAppsScript.Drive.Folder} folder 目標資料夾
 * @param {string} fileName 檔案名稱
 * @return {GoogleAppsScript.Drive.File|null}
 */
function findFileInFolder(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) {
      return file;
    }
  }
  return null;
}

/**
 * 在指定 Google Drive 資料夾中取得或建立 Spreadsheet（保證冪等，不重複建立）
 * @param {string} folderId Drive 目標資料夾 ID
 * @param {string} fileName 欲建立或取得的檔案名稱
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getOrCreateSpreadsheetInFolder(folderId, fileName) {
  var folder = DriveApp.getFolderById(folderId);
  var existingFile = findFileInFolder(folder, fileName);

  if (existingFile) {
    var existingSs = SpreadsheetApp.open(existingFile);
    applySpreadsheetSettings(existingSs);
    return existingSs;
  }

  // 檔案不存在時才建立
  var newSs = SpreadsheetApp.create(fileName);
  var file = DriveApp.getFileById(newSs.getId());
  
  // 將新建立的檔案移動至指定資料夾
  if (file.moveTo) {
    file.moveTo(folder);
  } else {
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  applySpreadsheetSettings(newSs);
  return newSs;
}

/**
 * 取得或建立「公司表單系統主檔資料庫」
 * 包含：專案主檔、廠商主檔、年度設定
 * 若已存在，會自動檢查並平滑升級 Header 為中文 Header，並設定 zh_TW 地區。
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getMasterDatabase() {
  var masterId = getMasterSpreadsheetId();
  var masterSs = null;

  // 1. 若 Script Properties 中已有紀錄，嘗試直接開啟
  if (masterId && masterId.trim() !== '') {
    try {
      var file = DriveApp.getFileById(masterId);
      if (file && !file.isTrashed()) {
        masterSs = SpreadsheetApp.openById(masterId);
      }
    } catch (e) {
      Logger.log('無法由既有 MASTER_SPREADSHEET_ID 開啟檔案，將重新由 Drive 目錄搜尋或建立：' + e.message);
    }
  }

  // 2. 若無紀錄或開啟失敗，從根目錄尋找或建立
  if (!masterSs) {
    var rootFolderId = getDriveRootFolderId();
    masterSs = getOrCreateSpreadsheetInFolder(rootFolderId, CONFIG_DEFAULTS.MASTER_DATABASE_NAME);
    setProperty(PROPERTY_KEYS.MASTER_SPREADSHEET_ID, masterSs.getId());
  }

  // 3. 套用試算表語系與時區 (zh_TW, Asia/Taipei)
  applySpreadsheetSettings(masterSs);

  // 4. 確保主檔工作表結構完整（專案主檔、廠商主檔、年度設定），並自動升級中文 Header
  MASTER_SHEET_NAMES.forEach(function (sheetName) {
    getOrCreateSheet(masterSs, sheetName, SCHEMAS[sheetName]);
  });

  // 5. 清理預設空白工作表
  cleanupDefaultSheets(masterSs, MASTER_SHEET_NAMES);

  return masterSs;
}

/**
 * 以最短路徑開啟主檔資料庫，供正常 CRUD runtime path 使用。
 * 初始化、schema repair 與 migration 必須由 getMasterDatabase() 負責。
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function openMasterDatabaseFast() {
  var masterId = getMasterSpreadsheetId();

  if (!masterId || String(masterId).trim() === '') {
    throw new Error('MASTER_SPREADSHEET_ID 尚未初始化');
  }

  return SpreadsheetApp.openById(String(masterId).trim());
}
