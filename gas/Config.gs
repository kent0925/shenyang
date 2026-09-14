/**
 * Config.gs - 系統組態與 Script Properties 管理
 * 
 * 規則：
 * 1. 程式只能從 Script Properties 取得環境 ID 與設定，嚴禁寫死 Google Drive / Spreadsheet ID。
 * 2. 第一次初始化前僅存在：
 *    - DRIVE_ROOT_FOLDER_ID
 *    - SCHEMA_VERSION=1
 *    - APP_ENV=production
 * 3. 初始化成功後自動寫入：
 *    - MASTER_SPREADSHEET_ID
 *    - CURRENT_YEAR
 */

/**
 * Script Properties 屬性名稱常數
 */
var PROPERTY_KEYS = {
  DRIVE_ROOT_FOLDER_ID: 'DRIVE_ROOT_FOLDER_ID',
  MASTER_SPREADSHEET_ID: 'MASTER_SPREADSHEET_ID',
  CURRENT_YEAR: 'CURRENT_YEAR',
  SCHEMA_VERSION: 'SCHEMA_VERSION',
  APP_ENV: 'APP_ENV',
  API_SHARED_SECRET: 'API_SHARED_SECRET',
};

/**
 * 系統預設值
 */
var CONFIG_DEFAULTS = {
  SCHEMA_VERSION: '1',
  APP_ENV: 'production',
  MASTER_DATABASE_NAME: '公司表單系統主檔資料庫',
  YEAR_DATABASE_SUFFIX: '公司表單資料庫',
};

/**
 * 取得 Script Property
 * @param {string} key 屬性鍵值
 * @return {string|null}
 */
function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * 設定 Script Property
 * @param {string} key 屬性鍵值
 * @param {string} value 屬性值
 */
function setProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/**
 * 批次設定 Script Properties
 * @param {Object} propertiesObj 鍵值物件
 */
function setProperties(propertiesObj) {
  var converted = {};
  Object.keys(propertiesObj).forEach(function (k) {
    converted[k] = String(propertiesObj[k]);
  });
  PropertiesService.getScriptProperties().setProperties(converted);
}

/**
 * 取得 Drive 根目錄資料夾 ID
 * @return {string}
 */
function getDriveRootFolderId() {
  var folderId = getProperty(PROPERTY_KEYS.DRIVE_ROOT_FOLDER_ID);
  if (!folderId || folderId.trim() === '') {
    throw new Error('未設定 DRIVE_ROOT_FOLDER_ID Script Property，請先於專案設定中指定 Drive 根目錄資料夾 ID。');
  }
  return folderId.trim();
}

/**
 * 取得主檔資料庫 Spreadsheet ID
 * @return {string|null}
 */
function getMasterSpreadsheetId() {
  return getProperty(PROPERTY_KEYS.MASTER_SPREADSHEET_ID);
}

/**
 * 取得當前年度
 * 優先由 Script Properties 取得，若無則依系統當前年份
 * @return {number}
 */
function getCurrentYear() {
  var yearProp = getProperty(PROPERTY_KEYS.CURRENT_YEAR);
  if (yearProp && !isNaN(parseInt(yearProp, 10))) {
    return parseInt(yearProp, 10);
  }
  return new Date().getFullYear();
}

/**
 * 取得 GAS API 共享密鑰
 * @return {string|null}
 */
function getApiSharedSecret() {
  return getProperty(PROPERTY_KEYS.API_SHARED_SECRET);
}
