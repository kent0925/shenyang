/**
 * Code.gs - 系統主入口、API Router 與初始化排程
 * 
 * 任務：
 * 公司表單系統 Phase 2A-2 安全 API 層與資料服務層
 * 
 * 核心功能：
 * 1. doPost(e): 正式 API 請求入口，統一進行 API_SHARED_SECRET 驗證與 Action 分發。
 * 2. doGet(e): 僅提供 METHOD_NOT_ALLOWED 提示，不提供任何資料查詢或修改。
 * 3. initializeSystem(): 僅供 Apps Script 後台人工執行之系統維護與升級函式，嚴禁由 API 調用。
 */

/**
 * 輔助建構統一 API 成功回應
 * @param {any} data 回傳資料
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function createSuccessResponse(data) {
  var output = {
    ok: true,
    data: data || {},
  };
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 輔助建構統一 API 失敗回應（不洩漏敏感內部錯誤與 Stack Trace）
 * @param {string} code 錯誤碼
 * @param {string} message 中文錯誤訊息
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function createErrorResponse(code, message) {
  var output = {
    ok: false,
    error: {
      code: code || 'INTERNAL_ERROR',
      message: message || '發生未預期的伺服器錯誤',
    },
  };
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Web App HTTP GET 入口（不提供資料操作）
 */
function doGet(e) {
  return createErrorResponse('METHOD_NOT_ALLOWED', '請使用 POST 方法存取 API');
}

/**
 * Web App HTTP POST 入口
 * @param {Object} e 包含 postData 之請求事件物件
 */
function doPost(e) {
  var actionName = 'unknown';
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createErrorResponse('INVALID_JSON', '缺少請求內容 (request body)');
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createErrorResponse('INVALID_JSON', '請求內容非合法 JSON 格式');
    }

    var secret = body.secret;
    var action = body.action;
    var payload = body.payload || {};
    actionName = action || 'undefined';

    // 1. 權限驗證：核對 API_SHARED_SECRET
    var expectedSecret = getApiSharedSecret();
    if (!expectedSecret || expectedSecret.trim() === '' || secret !== expectedSecret) {
      Logger.log('[API] 授權失敗 (action: ' + actionName + ')');
      return createErrorResponse('UNAUTHORIZED', '未授權的 API 請求');
    }

    // 2. 嚴禁透過 API 調用 initializeSystem
    if (action === 'initializeSystem') {
      Logger.log('[API] 拒絕存取內部初始化維護函式');
      return createErrorResponse('UNKNOWN_ACTION', '未知的請求動作 (action)');
    }

    // 3. Action 分發
    var resultData = null;
    switch (action) {
      case 'health':
        resultData = {
          service: 'company-form-backend',
          status: 'ok',
          schemaVersion: getProperty(PROPERTY_KEYS.SCHEMA_VERSION) || CONFIG_DEFAULTS.SCHEMA_VERSION,
          currentYear: String(getCurrentYear()),
        };
        break;

      case 'listProjects':
        resultData = handleListProjects(payload);
        break;

      case 'saveProject':
        resultData = handleSaveProject(payload);
        break;

      case 'listSubProjects':
        resultData = handleListSubProjects(payload);
        break;

      case 'saveSubProject':
        resultData = handleSaveSubProject(payload);
        break;

      case 'listVendors':
        resultData = handleListVendors(payload);
        break;

      case 'saveVendor':
        resultData = handleSaveVendor(payload);
        break;

      case 'listBudgetItems':
        resultData = handleListBudgetItems(payload);
        break;

      case 'saveBudgetItem':
        resultData = handleSaveBudgetItem(payload);
        break;

      case 'listForms':
        resultData = handleListForms(payload);
        break;

      case 'getForm':
        resultData = handleGetForm(payload);
        break;

      case 'saveForm':
        resultData = handleSaveForm(payload);
        break;

      case 'archiveFormFiles':
        resultData = handleArchiveFormFiles(payload);
        break;

      case 'getArchivedFormFile':
        resultData = handleGetArchivedFormFile(payload);
        break;

      case 'listArchivedFormVersions':
        resultData = handleListArchivedFormVersions(payload);
        break;

      case 'beginFormAttachmentUpload':
        resultData = handleBeginFormAttachmentUpload(payload);
        break;

      case 'uploadFormAttachmentChunk':
        resultData = handleUploadFormAttachmentChunk(payload);
        break;

      case 'finalizeFormAttachmentFile':
        resultData = handleFinalizeFormAttachmentFile(payload);
        break;

      case 'finalizeFormAttachment':
        resultData = handleFinalizeFormAttachment(payload);
        break;

      case 'listFormAttachments':
        resultData = handleListFormAttachments(payload);
        break;

      case 'getFormAttachmentFileInfo':
        resultData = handleGetFormAttachmentFileInfo(payload);
        break;

      case 'getFormAttachmentFileChunk':
        resultData = handleGetFormAttachmentFileChunk(payload);
        break;

      default:
        return createErrorResponse('UNKNOWN_ACTION', '未知的請求動作: ' + action);
    }

    Logger.log('[API] 執行成功 (action: ' + actionName + ')');
    return createSuccessResponse(resultData);
  } catch (err) {
    var rawMessage = err && err.message ? String(err.message) : 'unknown error';
    Logger.log('[API] 執行失敗 (action: ' + actionName + '): ' + rawMessage);

    var code = (err && err.code) ? err.code : 'INTERNAL_ERROR';
    var clientMessage;

    if (code === 'INTERNAL_ERROR') {
      // 未知錯誤一律使用泛化安全訊息，絕不洩漏系統例外細節或 ID
      clientMessage = '伺服器處理請求時發生錯誤';
    } else {
      // 已知業務錯誤（VALIDATION_ERROR, NOT_FOUND 等）回傳專用中文錯誤提示
      clientMessage = err.message || '業務請求處理失敗';
    }

    return createErrorResponse(code, clientMessage);
  }
}

/**
 * 系統初始化入口函式（僅供後台人工執行，禁止 API 調用）
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
