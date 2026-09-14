/**
 * Code.gs - 系統主入口與初始化排程
 * 
 * 任務：
 * 公司表單系統 Phase 2A-1 後端資料骨架與初始化
 * 
 * 核心功能：
 * 1. initializeSystem(): 執行一次性或重複執行之系統初始化（保證冪等）
 *    - 建立或取得「公司表單系統主檔資料庫」
 *    - 建立工作表：專案主檔、廠商主檔、年度設定
 *    - 建立當前年度資料庫（如「2026公司表單資料庫」）
 *    - 建立工作表：預算項目、表單紀錄、請款紀錄、付款紀錄、異動紀錄
 *    - 將主檔與年度資訊登記至 Script Properties 與「年度設定」
 * 2. createYearDatabase(year): 支援未來（如 2027）動態增加年度資料庫，禁止複製程式碼。
 */

/**
 * 系統初始化入口函式
 * 具備冪等性 (Idempotent)：重複執行不會產生重複資料庫或重複工作表
 * @return {Object} 初始化結果資訊
 */
function initializeSystem() {
  Logger.log('=== 開始執行公司表單系統初始化 ===');

  // 1. 驗證與讀取 Drive 根目錄 ID
  var rootFolderId = getDriveRootFolderId();
  Logger.log('Drive 根目錄資料夾 ID: ' + rootFolderId);

  // 2. 確保 Script Properties 預設環境值存在
  var schemaVersion = getProperty(PROPERTY_KEYS.SCHEMA_VERSION) || CONFIG_DEFAULTS.SCHEMA_VERSION;
  var appEnv = getProperty(PROPERTY_KEYS.APP_ENV) || CONFIG_DEFAULTS.APP_ENV;
  setProperty(PROPERTY_KEYS.SCHEMA_VERSION, schemaVersion);
  setProperty(PROPERTY_KEYS.APP_ENV, appEnv);

  // 3. 建立或取得共用主檔資料庫
  var masterSs = getMasterDatabase();
  var masterSpreadsheetId = masterSs.getId();
  setProperty(PROPERTY_KEYS.MASTER_SPREADSHEET_ID, masterSpreadsheetId);
  Logger.log('主檔資料庫已確認，Spreadsheet ID: ' + masterSpreadsheetId);

  // 4. 決定目前年度（不寫死年度，優先讀取 Property，預設使用當前年份）
  var currentYear = getCurrentYear();
  setProperty(PROPERTY_KEYS.CURRENT_YEAR, currentYear);
  Logger.log('目前運作年度: ' + currentYear);

  // 5. 建立或確認目前年度獨立資料庫
  var yearSs = createYearDatabase(currentYear);
  var yearSpreadsheetId = yearSs.getId();
  Logger.log('年度資料庫已確認，Spreadsheet ID: ' + yearSpreadsheetId);

  Logger.log('=== 公司表單系統初始化完成 ===');

  return {
    success: true,
    message: '公司表單系統初始化成功',
    schemaVersion: schemaVersion,
    appEnv: appEnv,
    masterDatabase: {
      name: CONFIG_DEFAULTS.MASTER_DATABASE_NAME,
      spreadsheetId: masterSpreadsheetId,
      sheets: MASTER_SHEET_NAMES,
    },
    currentYearDatabase: {
      year: currentYear,
      name: getYearDatabaseName(currentYear),
      spreadsheetId: yearSpreadsheetId,
      sheets: YEAR_SHEET_NAMES,
    },
  };
}
