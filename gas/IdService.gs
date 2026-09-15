/**
 * IdService.gs - 安全序號產生器服務
 * 
 * 規範：
 * 1. 支援格式：
 *    - 專案：PRJ-000001
 *    - 廠商：VEN-000001
 *    - 分案：SUB-000001
 *    - 預算項目：BUD-YYYY-000001 (如 BUD-2026-000001)
 *    - 表單紀錄：FRM-YYYY-000001 (如 FRM-2026-000001)
 * 2. 併發防護：使用 LockService.getScriptLock() 確保多人同時儲存不產生重複序號。
 * 3. Bootstrap 機制：若 Script Properties 中 counter 尚未初始化，自動掃描既有工作表最大序號。
 * 4. 單調遞增：即使刪除某一資料列，序號計數器只增不減，絕不重複使用舊 ID。
 */

/**
 * 序號前綴與類型常數
 */
var ID_TYPES = {
  PROJECT: 'PROJECT',
  VENDOR: 'VENDOR',
  SUB_PROJECT: 'SUB_PROJECT',
  BUDGET: 'BUDGET',
  FORM: 'FORM',
};

/**
 * 格式化 6 位數字字串 (例如 5 -> "000005")
 * @param {number} num 數值
 * @return {string}
 */
function padZero6(num) {
  var s = String(num);
  while (s.length < 6) {
    s = '0' + s;
  }
  return s;
}

/**
 * 從工作表中掃描並解析現有最大序號（Bootstrap 用）
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 目標工作表
 * @param {RegExp} regex 匹配序號的正規表示式（捕獲組 1 應為數字序號）
 * @return {number}
 */
function scanMaxSequenceFromSheet(sheet, regex) {
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var maxSeq = 0;

  for (var i = 0; i < idValues.length; i++) {
    var cellVal = String(idValues[i][0]).trim();
    var match = cellVal.match(regex);
    if (match && match[1]) {
      var seq = parseInt(match[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return maxSeq;
}

/**
 * 產生下一個安全序號
 * @param {string} type 序號類型 (PROJECT, VENDOR, BUDGET, FORM)
 * @param {number|string} [year] 年度（BUDGET 與 FORM 必填）
 * @return {string} 產生的 ID
 */
function getNextId(type, year) {
  var lock = LockService.getScriptLock();
  try {
    // 最多等待 10 秒取得排他鎖
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('系統忙碌中（無法取得序號鎖定），請稍後再試。');
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var currentYear = year ? String(year).trim() : String(getCurrentYear());

    switch (type) {
      case ID_TYPES.PROJECT: {
        var propKeyPrj = 'COUNTER_PROJECT';
        var currentSeqStrPrj = props.getProperty(propKeyPrj);
        var currentSeqPrj = 0;

        if (currentSeqStrPrj === null || currentSeqStrPrj === '') {
          // Bootstrap：由主檔「專案主檔」搜尋最大序號
          var masterSsPrj = openMasterDatabaseFast();
          var prjSheet = masterSsPrj.getSheetByName(SHEETS.PROJECTS);
          currentSeqPrj = scanMaxSequenceFromSheet(prjSheet, /^PRJ-(\d+)$/);
        } else {
          currentSeqPrj = parseInt(currentSeqStrPrj, 10) || 0;
        }

        var nextSeqPrj = currentSeqPrj + 1;
        props.setProperty(propKeyPrj, String(nextSeqPrj));
        return 'PRJ-' + padZero6(nextSeqPrj);
      }

      case ID_TYPES.VENDOR: {
        var propKeyVen = 'COUNTER_VENDOR';
        var currentSeqStrVen = props.getProperty(propKeyVen);
        var currentSeqVen = 0;

        if (currentSeqStrVen === null || currentSeqStrVen === '') {
          // Bootstrap：由主檔「廠商主檔」搜尋最大序號
          var masterSsVen = openMasterDatabaseFast();
          var venSheet = masterSsVen.getSheetByName(SHEETS.VENDORS);
          currentSeqVen = scanMaxSequenceFromSheet(venSheet, /^VEN-(\d+)$/);
        } else {
          currentSeqVen = parseInt(currentSeqStrVen, 10) || 0;
        }

        var nextSeqVen = currentSeqVen + 1;
        props.setProperty(propKeyVen, String(nextSeqVen));
        return 'VEN-' + padZero6(nextSeqVen);
      }

      case ID_TYPES.SUB_PROJECT: {
        var propKeySub = 'COUNTER_SUB_PROJECT';
        var currentSeqStrSub = props.getProperty(propKeySub);
        var currentSeqSub = 0;
        if (currentSeqStrSub === null || currentSeqStrSub === '') {
          var masterSsSub = openMasterDatabaseFast();
          var subSheet = masterSsSub.getSheetByName(SHEETS.SUB_PROJECTS);
          currentSeqSub = scanMaxSequenceFromSheet(subSheet, /^SUB-(\d+)$/);
        } else {
          currentSeqSub = parseInt(currentSeqStrSub, 10) || 0;
        }
        var nextSeqSub = currentSeqSub + 1;
        props.setProperty(propKeySub, String(nextSeqSub));
        return 'SUB-' + padZero6(nextSeqSub);
      }

      case ID_TYPES.BUDGET: {
        var propKeyBud = 'COUNTER_BUDGET_' + currentYear;
        var currentSeqStrBud = props.getProperty(propKeyBud);
        var currentSeqBud = 0;

        if (currentSeqStrBud === null || currentSeqStrBud === '') {
          // Bootstrap：由該年度資料庫「預算項目」搜尋最大序號
          var yearSsBud = getYearDatabase(currentYear) || createYearDatabase(currentYear);
          var budSheet = yearSsBud.getSheetByName(SHEETS.BUDGET_ITEMS);
          var budRegex = new RegExp('^BUD-' + currentYear + '-(\\d+)$');
          currentSeqBud = scanMaxSequenceFromSheet(budSheet, budRegex);
        } else {
          currentSeqBud = parseInt(currentSeqStrBud, 10) || 0;
        }

        var nextSeqBud = currentSeqBud + 1;
        props.setProperty(propKeyBud, String(nextSeqBud));
        return 'BUD-' + currentYear + '-' + padZero6(nextSeqBud);
      }

      case ID_TYPES.FORM: {
        var propKeyFrm = 'COUNTER_FORM_' + currentYear;
        var currentSeqStrFrm = props.getProperty(propKeyFrm);
        var currentSeqFrm = 0;

        if (currentSeqStrFrm === null || currentSeqStrFrm === '') {
          // Bootstrap：由該年度資料庫「表單紀錄」搜尋最大序號
          var yearSsFrm = getYearDatabase(currentYear) || createYearDatabase(currentYear);
          var frmSheet = yearSsFrm.getSheetByName(SHEETS.FORMS);
          var frmRegex = new RegExp('^FRM-' + currentYear + '-(\\d+)$');
          currentSeqFrm = scanMaxSequenceFromSheet(frmSheet, frmRegex);
        } else {
          currentSeqFrm = parseInt(currentSeqStrFrm, 10) || 0;
        }

        var nextSeqFrm = currentSeqFrm + 1;
        props.setProperty(propKeyFrm, String(nextSeqFrm));
        return 'FRM-' + currentYear + '-' + padZero6(nextSeqFrm);
      }

      default:
        throw new Error('未知的序號類型: ' + type);
    }
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // 忽略釋放鎖的異常
    }
  }
}
