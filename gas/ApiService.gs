/**
 * ApiService.gs - 後端資料操作業務邏輯層
 * 
 * 實作 actions：
 * - listProjects / saveProject
 * - listVendors / saveVendor
 * - listBudgetItems / saveBudgetItem
 * - listForms / getForm / saveForm
 * 
 * 核心原則：
 * 1. 統一使用 Phase 2A-1 定義之 SCHEMAS、rowToObject、objectToRow，禁止寫死固定 column index。
 * 2. 帳號、統編、代碼欄位強制保持純文字字串，防範前置 0 遺失。
 * 3. payloadJson 必須使用 JSON.stringify() 儲存，禁止將 [object Object] 寫入 Sheet。
 * 4. saveForm() 本階段只寫入「表單紀錄」，嚴禁自動建立 Claim。
 * 5. 錯誤時拋出帶有 code 屬性的 Error (如 VALIDATION_ERROR, NOT_FOUND)。
 */

/**
 * 建立具備業務錯誤碼的例外物件
 * @param {string} code 錯誤代碼 (VALIDATION_ERROR, NOT_FOUND, etc.)
 * @param {string} message 中文錯誤訊息
 * @return {Error}
 */
function createApiError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

/**
 * 在特定工作表第 1 欄搜尋特定 ID 所在的列號 (1-based)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 目標工作表
 * @param {string} id 尋找的編號
 * @return {number} 列號，找不到時回傳 -1
 */
function findRowIndexById(sheet, id) {
  if (!sheet || !id) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetId = String(id).trim();

  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0]).trim() === targetId) {
      return i + 2; // 資料列從第 2 列開始
    }
  }

  return -1;
}

// ==========================================
// 1. Projects API
// ==========================================

function handleListProjects(payload) {
  var masterSs = openMasterDatabaseFast();
  var sheet = masterSs.getSheetByName(SHEETS.PROJECTS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var numCols = SCHEMAS[SHEETS.PROJECTS].columns.length;
  var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var projects = [];

  for (var i = 0; i < rows.length; i++) {
    var prj = rowToObject(SHEETS.PROJECTS, rows[i]);
    if (prj.projectId) {
      projects.push(prj);
    }
  }

  return projects;
}

function handleSaveProject(payload) {
  if (!payload) throw createApiError('VALIDATION_ERROR', '缺少請求內容 (payload)');
  if (!payload.company || String(payload.company).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '公司名稱 (company) 為必填欄位');
  }
  if (!payload.projectName || String(payload.projectName).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '專案名稱 (projectName) 為必填欄位');
  }

  var masterSs = openMasterDatabaseFast();
  var sheet = masterSs.getSheetByName(SHEETS.PROJECTS);
  var projectId = payload.projectId ? String(payload.projectId).trim() : '';

  if (projectId) {
    // 更新既有專案
    var rowIndex = findRowIndexById(sheet, projectId);
    if (rowIndex === -1) {
      throw createApiError('NOT_FOUND', '找不到專案編號: ' + projectId);
    }

    var numCols = SCHEMAS[SHEETS.PROJECTS].columns.length;
    var existingRow = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
    var existingObj = rowToObject(SHEETS.PROJECTS, existingRow);

    var nextStatus = payload.status || existingObj.status || 'active';
    // 專案結案是由分案驅動，不能只靠前端 disabled。
    if (String(nextStatus).toLowerCase() === 'closed') {
      var subSheetForClose = masterSs.getSheetByName(SHEETS.SUB_PROJECTS);
      var activeNames = [];
      if (subSheetForClose && subSheetForClose.getLastRow() > 1) {
        var subRowsForClose = subSheetForClose.getRange(2, 1, subSheetForClose.getLastRow() - 1, SCHEMAS[SHEETS.SUB_PROJECTS].columns.length).getValues();
        subRowsForClose.forEach(function (row) {
          var sub = rowToObject(SHEETS.SUB_PROJECTS, row);
          if (String(sub.projectId) === projectId && String(sub.status || 'active').toLowerCase() === 'active') activeNames.push(sub.subProjectName || sub.subProjectId);
        });
      }
      if (activeNames.length) throw createApiError('VALIDATION_ERROR', '無法結案，目前仍有 ' + activeNames.length + ' 個進行中的分案：' + activeNames.join('、'));
    }

    var updatedObj = {
      projectId: existingObj.projectId,
      company: payload.company || existingObj.company,
      projectName: payload.projectName || existingObj.projectName,
      status: nextStatus,
      createdAt: existingObj.createdAt,
      updatedAt: getCurrentTimestamp(),
    };

    var updatedRow = objectToRow(SHEETS.PROJECTS, updatedObj);
    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    return updatedObj;
  } else {
    // 新增專案
    var newProjectId = getNextId(ID_TYPES.PROJECT);
    var newProjectObj = {
      projectId: newProjectId,
      company: String(payload.company).trim(),
      projectName: String(payload.projectName).trim(),
      status: payload.status ? String(payload.status).trim() : 'active',
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
    };

    var newRow = objectToRow(SHEETS.PROJECTS, newProjectObj);
    sheet.appendRow(newRow);
    return newProjectObj;
  }
}

// ==========================================
// 2. Vendors API
// ==========================================

function handleListSubProjects(payload) {
  var projectId = payload && payload.projectId ? String(payload.projectId).trim() : '';
  var status = payload && payload.status ? String(payload.status).trim() : '';
  var ss = openMasterDatabaseFast();
  var sheet = ss.getSheetByName(SHEETS.SUB_PROJECTS);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var cols = SCHEMAS[SHEETS.SUB_PROJECTS].columns.length;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues();
  return rows.map(function (row) { return rowToObject(SHEETS.SUB_PROJECTS, row); }).filter(function (item) {
    return item.subProjectId && (!projectId || String(item.projectId) === projectId) && (!status || String(item.status) === status);
  });
}

function handleSaveSubProject(payload) {
  if (!payload) throw createApiError('VALIDATION_ERROR', '缺少請求內容 (payload)');
  var projectId = payload.projectId ? String(payload.projectId).trim() : '';
  var name = payload.subProjectName ? String(payload.subProjectName).trim() : '';
  if (!projectId) throw createApiError('VALIDATION_ERROR', '專案編號 (projectId) 為必填欄位');
  if (!name) throw createApiError('VALIDATION_ERROR', '分案名稱 (subProjectName) 為必填欄位');
  function failStage(stage, error) {
    var message = error && error.message ? String(error.message) : String(error);
    Logger.log('[saveSubProject] stage=' + stage + ' error=' + message);
    if (error && error.code) throw error;
    throw createApiError('INTERNAL_ERROR', '儲存分案時發生錯誤');
  }

  var ss;
  var projectSheet;
  Logger.log('[saveSubProject] stage=parent-project-lookup');
  try {
    ss = openMasterDatabaseFast();
    if (!ss) throw new Error('主檔資料庫未設定');
    projectSheet = ss.getSheetByName(SHEETS.PROJECTS);
    if (!projectSheet) throw createApiError('CONFIGURATION_ERROR', '找不到專案主檔工作表');
    var parentRow = findRowIndexById(projectSheet, projectId);
    if (parentRow === -1) throw createApiError('NOT_FOUND', '找不到專案編號: ' + projectId);
    var parentProject = rowToObject(SHEETS.PROJECTS, projectSheet.getRange(parentRow, 1, 1, SCHEMAS[SHEETS.PROJECTS].columns.length).getValues()[0]);
    if (!payload.subProjectId && String(parentProject.status || '').toLowerCase() === 'closed') throw createApiError('VALIDATION_ERROR', '專案已結案，不可新增一般分案');
  } catch (error) {
    failStage('parent-project-lookup', error);
  }

  var sheet;
  Logger.log('[saveSubProject] stage=subproject-sheet-lookup');
  try {
    sheet = ss.getSheetByName(SHEETS.SUB_PROJECTS);
    if (!sheet) throw createApiError('CONFIGURATION_ERROR', '找不到分案主檔工作表');
  } catch (error) {
    failStage('subproject-sheet-lookup', error);
  }

  var subId = payload.subProjectId ? String(payload.subProjectId).trim() : '';
  if (subId) {
    var rowIndex = findRowIndexById(sheet, subId);
    if (rowIndex === -1) throw createApiError('NOT_FOUND', '找不到分案編號: ' + subId);
    var cols = SCHEMAS[SHEETS.SUB_PROJECTS].columns.length;
    var old = rowToObject(SHEETS.SUB_PROJECTS, sheet.getRange(rowIndex, 1, 1, cols).getValues()[0]);
    if (String(old.projectId) !== projectId) throw createApiError('VALIDATION_ERROR', '分案不可變更所屬專案');
    var nextSubStatus = payload.status || old.status || 'active';
    if (isActiveStatus(old.status) && String(nextSubStatus).toLowerCase() === 'closed') {
      var activeBudgets = findActiveBudgetItemsForSubProject(ss, old.subProjectId);
      if (activeBudgets.length) throw createApiError('VALIDATION_ERROR', '此分案仍有 ' + activeBudgets.length + ' 個進行中的預算項目，請先完成相關預算項目後再結案：' + activeBudgets.map(function (item) { return item.itemName || item.budgetItemId; }).join('、'));
    }
    if (!isActiveStatus(parentProject.status) && isActiveStatus(nextSubStatus)) throw createApiError('VALIDATION_ERROR', '上層專案已結案，請先重新開啟專案後再啟用分案');
    var updated = { subProjectId: old.subProjectId, projectId: old.projectId, subProjectName: name, status: nextSubStatus, createdAt: old.createdAt, updatedAt: getCurrentTimestamp() };
    var updatedRow;
    Logger.log('[saveSubProject] stage=row-serialization');
    try {
      updatedRow = objectToRow(SHEETS.SUB_PROJECTS, updated);
    } catch (error) {
      failStage('row-serialization', error);
    }
    Logger.log('[saveSubProject] stage=sheet-write');
    try {
      sheet.getRange(rowIndex, 1, 1, cols).setValues([updatedRow]);
    } catch (error) {
      failStage('sheet-write', error);
    }
    return updated;
  }
  var subProjectId;
  Logger.log('[saveSubProject] stage=id-generation');
  try {
    subProjectId = getNextId(ID_TYPES.SUB_PROJECT);
  } catch (error) {
    failStage('id-generation', error);
  }
  var created = { subProjectId: subProjectId, projectId: projectId, subProjectName: name, status: payload.status ? String(payload.status).trim() : 'active', createdAt: getCurrentTimestamp(), updatedAt: getCurrentTimestamp() };
  var createdRow;
  Logger.log('[saveSubProject] stage=row-serialization');
  try {
    createdRow = objectToRow(SHEETS.SUB_PROJECTS, created);
  } catch (error) {
    failStage('row-serialization', error);
  }
  Logger.log('[saveSubProject] stage=sheet-write');
  try {
    sheet.appendRow(createdRow);
  } catch (error) {
    failStage('sheet-write', error);
  }
  return created;
}

// ==========================================
// 3. Vendors API
// ==========================================

function handleListVendors(payload) {
  var masterSs = openMasterDatabaseFast();
  var sheet = masterSs.getSheetByName(SHEETS.VENDORS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var numCols = SCHEMAS[SHEETS.VENDORS].columns.length;
  var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var vendors = [];

  for (var i = 0; i < rows.length; i++) {
    var ven = rowToObject(SHEETS.VENDORS, rows[i]);
    if (ven.vendorId) {
      // 解析或組裝 bankAccounts 多帳號清單（確保向下相容）
      var accounts = [];
      if (ven.bankAccounts) {
        try {
          var parsed = typeof ven.bankAccounts === 'string' ? JSON.parse(ven.bankAccounts) : ven.bankAccounts;
          if (Array.isArray(parsed)) {
            accounts = parsed;
          }
        } catch (e) {
          // 忽略解析錯誤
        }
      }
      if (accounts.length === 0 && (ven.accountNumber || ven.bankCode)) {
        accounts.push({
          bankCode: ven.bankCode || '',
          bankName: ven.bankName || '',
          branchCode: ven.branchCode || '',
          branchName: ven.branchName || '',
          accountName: ven.accountName || '',
          accountNumber: ven.accountNumber || '',
        });
      }
      ven.bankAccounts = accounts;
      vendors.push(ven);
    }
  }

  return vendors;
}

function handleSaveVendor(payload) {
  if (!payload) throw createApiError('VALIDATION_ERROR', '缺少請求內容 (payload)');
  if (!payload.vendorName || String(payload.vendorName).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '廠商名稱 (vendorName) 為必填欄位');
  }

  var masterSs = openMasterDatabaseFast();
  var sheet = masterSs.getSheetByName(SHEETS.VENDORS);
  var vendorId = payload.vendorId ? String(payload.vendorId).trim() : '';

  // 確保文字欄位維持字串型態，避免 007 變成 7
  var cleanTaxId = payload.taxId !== undefined && payload.taxId !== null ? String(payload.taxId) : '';
  var cleanBankCode = payload.bankCode !== undefined && payload.bankCode !== null ? String(payload.bankCode) : '';
  var cleanBranchCode = payload.branchCode !== undefined && payload.branchCode !== null ? String(payload.branchCode) : '';
  var cleanAccountNumber = payload.accountNumber !== undefined && payload.accountNumber !== null ? String(payload.accountNumber) : '';

  // 處理 bankAccounts 多帳號陣列
  var bankAccounts = [];
  if (payload.bankAccounts && Array.isArray(payload.bankAccounts)) {
    bankAccounts = payload.bankAccounts;
  } else if (cleanAccountNumber || cleanBankCode) {
    bankAccounts = [{
      bankCode: cleanBankCode,
      bankName: payload.bankName ? String(payload.bankName).trim() : '',
      branchCode: cleanBranchCode,
      branchName: payload.branchName ? String(payload.branchName).trim() : '',
      accountName: payload.accountName ? String(payload.accountName).trim() : '',
      accountNumber: cleanAccountNumber,
    }];
  }

  // 首筆帳號同步回填至平鋪欄位（保持平鋪欄位向後相容）
  var primaryAcc = bankAccounts.length > 0 ? bankAccounts[0] : null;
  var finalBankCode = primaryAcc ? (primaryAcc.bankCode || '') : cleanBankCode;
  var finalBankName = primaryAcc ? (primaryAcc.bankName || '') : (payload.bankName ? String(payload.bankName).trim() : '');
  var finalBranchCode = primaryAcc ? (primaryAcc.branchCode || '') : cleanBranchCode;
  var finalBranchName = primaryAcc ? (primaryAcc.branchName || '') : (payload.branchName ? String(payload.branchName).trim() : '');
  var finalAccountName = primaryAcc ? (primaryAcc.accountName || '') : (payload.accountName ? String(payload.accountName).trim() : '');
  var finalAccountNumber = primaryAcc ? (primaryAcc.accountNumber || '') : cleanAccountNumber;

  if (vendorId) {
    // 更新廠商
    var rowIndex = findRowIndexById(sheet, vendorId);
    if (rowIndex === -1) {
      throw createApiError('NOT_FOUND', '找不到廠商編號: ' + vendorId);
    }

    var numCols = SCHEMAS[SHEETS.VENDORS].columns.length;
    var existingRow = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
    var existingObj = rowToObject(SHEETS.VENDORS, existingRow);

    // 若未傳入新 bankAccounts，沿用原有或以平鋪欄位 fallback
    if (!payload.bankAccounts && existingObj.bankAccounts) {
      try {
        var parsedOld = typeof existingObj.bankAccounts === 'string' ? JSON.parse(existingObj.bankAccounts) : existingObj.bankAccounts;
        if (Array.isArray(parsedOld) && parsedOld.length > 0) {
          bankAccounts = parsedOld;
        }
      } catch (e) {}
    }

    var updatedObj = {
      vendorId: existingObj.vendorId,
      vendorName: payload.vendorName || existingObj.vendorName,
      taxId: cleanTaxId || existingObj.taxId,
      entityType: payload.entityType || existingObj.entityType || '公司',
      bankCode: finalBankCode || existingObj.bankCode,
      bankName: finalBankName || existingObj.bankName,
      branchCode: finalBranchCode || existingObj.branchCode,
      branchName: finalBranchName || existingObj.branchName,
      accountName: finalAccountName || existingObj.accountName,
      accountNumber: finalAccountNumber || existingObj.accountNumber,
      isActive: payload.isActive !== undefined ? payload.isActive : existingObj.isActive,
      createdAt: existingObj.createdAt,
      updatedAt: getCurrentTimestamp(),
      bankAccounts: JSON.stringify(bankAccounts),
    };

    var updatedRow = objectToRow(SHEETS.VENDORS, updatedObj);
    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    
    // 回傳物件中將 bankAccounts 轉回陣列
    var returnObj = Object.assign({}, updatedObj);
    returnObj.bankAccounts = bankAccounts;
    return returnObj;
  } else {
    // 新增廠商
    var newVendorId = getNextId(ID_TYPES.VENDOR);
    var newVendorObj = {
      vendorId: newVendorId,
      vendorName: String(payload.vendorName).trim(),
      taxId: cleanTaxId,
      entityType: payload.entityType ? String(payload.entityType).trim() : '公司',
      bankCode: finalBankCode,
      bankName: finalBankName,
      branchCode: finalBranchCode,
      branchName: finalBranchName,
      accountName: finalAccountName,
      accountNumber: finalAccountNumber,
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      bankAccounts: JSON.stringify(bankAccounts),
    };

    var newRow = objectToRow(SHEETS.VENDORS, newVendorObj);
    sheet.appendRow(newRow);

    var returnNewObj = Object.assign({}, newVendorObj);
    returnNewObj.bankAccounts = bankAccounts;
    return returnNewObj;
  }
}

// ==========================================
// 3. Budget Items API
// ==========================================

function handleListBudgetItems(payload) {
  var year = (payload && payload.year) ? parseInt(payload.year, 10) : getCurrentYear();
  var projectId = (payload && payload.projectId) ? String(payload.projectId).trim() : '';
  var subProjectId = (payload && payload.subProjectId) ? String(payload.subProjectId).trim() : '';

  // 純讀取 API：不得建立年度資料庫，若不存在直接回傳空陣列
  var yearSs = getYearDatabase(year);
  if (!yearSs) return [];

  var sheet = yearSs.getSheetByName(SHEETS.BUDGET_ITEMS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var numCols = SCHEMAS[SHEETS.BUDGET_ITEMS].columns.length;
  var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var items = [];

  for (var i = 0; i < rows.length; i++) {
    var item = rowToObject(SHEETS.BUDGET_ITEMS, rows[i]);
    if (item.budgetItemId) {
      if (!projectId || item.projectId === projectId) {
        if (subProjectId && String(item.subProjectId || '') !== subProjectId) continue;
        items.push(item);
      }
    }
  }

  return items;
}

function handleSaveBudgetItem(payload) {
  if (!payload) throw createApiError('VALIDATION_ERROR', '缺少請求內容 (payload)');
  if (!payload.company || String(payload.company).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '公司名稱 (company) 為必填欄位');
  }
  if (!payload.projectName || String(payload.projectName).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '專案名稱 (projectName) 為必填欄位');
  }
  if (!payload.itemName || String(payload.itemName).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '項目名稱 (itemName) 為必填欄位');
  }

  var projectId = payload.projectId ? String(payload.projectId).trim() : '';
  var subProjectId = payload.subProjectId ? String(payload.subProjectId).trim() : '';
  var masterSs = openMasterDatabaseFast();
  var projectSheet = masterSs.getSheetByName(SHEETS.PROJECTS);
  var projectRow = projectId ? findRowIndexById(projectSheet, projectId) : -1;
  if (!projectId) throw createApiError('VALIDATION_ERROR', '預算項目必須提供專案編號');
  if (projectRow === -1) throw createApiError('NOT_FOUND', '找不到專案編號: ' + projectId);
  var authoritativeProject = rowToObject(SHEETS.PROJECTS, projectSheet.getRange(projectRow, 1, 1, SCHEMAS[SHEETS.PROJECTS].columns.length).getValues()[0]);
  if (!payload.budgetItemId && !subProjectId) throw createApiError('VALIDATION_ERROR', '新增預算項目必須提供分案編號');
  var subProject = null;
  if (subProjectId) {
    var subSheet = masterSs.getSheetByName(SHEETS.SUB_PROJECTS);
    var subRow = findRowIndexById(subSheet, subProjectId);
    if (subRow === -1) throw createApiError('NOT_FOUND', '找不到分案編號: ' + subProjectId);
    subProject = rowToObject(SHEETS.SUB_PROJECTS, subSheet.getRange(subRow, 1, 1, SCHEMAS[SHEETS.SUB_PROJECTS].columns.length).getValues()[0]);
    if (projectId && String(subProject.projectId) !== projectId) throw createApiError('VALIDATION_ERROR', '預算項目專案與分案不符');
    if (String(subProject.status || '').toLowerCase() === 'closed') throw createApiError('VALIDATION_ERROR', '分案已結案，不可新增或修改一般預算項目');
  }

  var year = payload.year ? parseInt(payload.year, 10) : getCurrentYear();
  // 寫入前一律走既有 idempotent schema repair；只追加缺少欄位，絕不重建年度資料。
  var yearSs = createYearDatabase(year);
  var sheet = yearSs.getSheetByName(SHEETS.BUDGET_ITEMS);
  var budgetItemId = payload.budgetItemId ? String(payload.budgetItemId).trim() : '';

  var budgetAmount = Number(payload.budgetAmount) || 0;
  var terminatedAmount = Number(payload.terminatedAmount) || 0;

  if (budgetItemId) {
    // 更新預算項目
    var rowIndex = findRowIndexById(sheet, budgetItemId);
    if (rowIndex === -1) {
      throw createApiError('NOT_FOUND', '找不到預算項目編號: ' + budgetItemId);
    }

    var numCols = SCHEMAS[SHEETS.BUDGET_ITEMS].columns.length;
    var existingRow = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
    var existingObj = rowToObject(SHEETS.BUDGET_ITEMS, existingRow);

    // 舊資料可能未帶 subProjectId；不可自行猜測歸屬。其餘已關聯資料也必須遵守結案鎖定。
    if (!subProject && existingObj.subProjectId) {
      var existingSubSheet = masterSs.getSheetByName(SHEETS.SUB_PROJECTS);
      var existingSubRow = findRowIndexById(existingSubSheet, String(existingObj.subProjectId));
      if (existingSubRow !== -1) {
        var existingSub = rowToObject(SHEETS.SUB_PROJECTS, existingSubSheet.getRange(existingSubRow, 1, 1, SCHEMAS[SHEETS.SUB_PROJECTS].columns.length).getValues()[0]);
        if (String(existingSub.status || '').toLowerCase() === 'closed') throw createApiError('VALIDATION_ERROR', '分案已結案，不可新增或修改一般預算項目');
      }
    }

    var nextBudgetStatus = payload.status || existingObj.status || 'active';
    if (isActiveStatus(nextBudgetStatus) && (!isActiveStatus(authoritativeProject.status) || (subProject && !isActiveStatus(subProject.status)))) throw createApiError('VALIDATION_ERROR', '上層專案或分案已結案，不可重新啟用預算項目');
    var updatedObj = {
      budgetItemId: existingObj.budgetItemId,
      year: String(year),
      projectId: payload.projectId !== undefined ? payload.projectId : existingObj.projectId,
      company: authoritativeProject.company,
      projectName: authoritativeProject.projectName,
      subProjectId: payload.subProjectId !== undefined ? subProjectId : (existingObj.subProjectId || ''),
      subProjectName: subProject ? subProject.subProjectName : (payload.subProjectName !== undefined ? payload.subProjectName : (existingObj.subProjectName || '')),
      itemName: payload.itemName || existingObj.itemName,
      vendorId: payload.vendorId !== undefined ? payload.vendorId : existingObj.vendorId,
      vendorName: payload.vendorName !== undefined ? payload.vendorName : existingObj.vendorName,
      budgetAmount: payload.budgetAmount !== undefined ? budgetAmount : existingObj.budgetAmount,
      terminatedAmount: payload.terminatedAmount !== undefined ? terminatedAmount : existingObj.terminatedAmount,
      status: payload.status || existingObj.status || 'active',
      createdAt: existingObj.createdAt,
      updatedAt: getCurrentTimestamp(),
    };

    var updatedRow = objectToRow(SHEETS.BUDGET_ITEMS, updatedObj);
    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    return updatedObj;
  } else {
    // 新增預算項目
    if (!isActiveStatus(authoritativeProject.status) || !subProject || !isActiveStatus(subProject.status)) throw createApiError('VALIDATION_ERROR', '上層專案或分案已結案，不可新增預算項目');
    var newBudgetItemId = getNextId(ID_TYPES.BUDGET, year);
    var newBudgetItemObj = {
      budgetItemId: newBudgetItemId,
      year: String(year),
      projectId: payload.projectId ? String(payload.projectId).trim() : '',
      company: authoritativeProject.company,
      projectName: authoritativeProject.projectName,
      subProjectId: subProjectId,
      subProjectName: subProject.subProjectName,
      itemName: String(payload.itemName).trim(),
      vendorId: payload.vendorId ? String(payload.vendorId).trim() : '',
      vendorName: payload.vendorName ? String(payload.vendorName).trim() : '',
      budgetAmount: budgetAmount,
      terminatedAmount: terminatedAmount,
      status: payload.status ? String(payload.status).trim() : 'active',
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
    };

    var newRow = objectToRow(SHEETS.BUDGET_ITEMS, newBudgetItemObj);
    sheet.appendRow(newRow);
    return newBudgetItemObj;
  }
}

// ==========================================
// 4. 請款週期規則與期別 Snapshot API
// ==========================================

function toIsoDate(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var text = String(value).trim();
  var match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!match) return '';
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

function isActiveStatus(status) { return String(status || 'active').toLowerCase() === 'active'; }

function listConfiguredYears(masterSs) {
  var years = [getCurrentYear()];
  var yearSheet = masterSs.getSheetByName(SHEETS.YEAR_CONFIG);
  if (!yearSheet || yearSheet.getLastRow() <= 1) return years;
  yearSheet.getRange(2, 1, yearSheet.getLastRow() - 1, SCHEMAS[SHEETS.YEAR_CONFIG].columns.length).getValues().forEach(function (row) {
    var config = rowToObject(SHEETS.YEAR_CONFIG, row); var year = Number(config.year);
    if (year && years.indexOf(year) === -1) years.push(year);
  });
  return years;
}

function findActiveBudgetItemsForSubProject(masterSs, subProjectId) {
  var active = [];
  listConfiguredYears(masterSs).forEach(function (year) {
    var yearSs = getYearDatabase(year); if (!yearSs) return;
    var sheet = yearSs.getSheetByName(SHEETS.BUDGET_ITEMS); if (!sheet || sheet.getLastRow() <= 1) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMAS[SHEETS.BUDGET_ITEMS].columns.length).getValues().forEach(function (row) {
      var item = rowToObject(SHEETS.BUDGET_ITEMS, row);
      if (String(item.subProjectId || '') === String(subProjectId) && isActiveStatus(item.status)) active.push(item);
    });
  });
  return active;
}

function isoDateFromParts(year, monthIndex, day) {
  return Utilities.formatDate(new Date(year, monthIndex, day, 12, 0, 0), 'Asia/Taipei', 'yyyy-MM-dd');
}

function parseIsoDate(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function validateBillingRuleInput(payload) {
  var submission = Number(payload.submissionDay);
  var paymentOffset = Number(payload.paymentMonthOffset);
  var paymentDay = Number(payload.paymentDay);
  var effectiveFrom = toIsoDate(payload.effectiveFrom);
  if (!effectiveFrom) throw createApiError('VALIDATION_ERROR', '新規則生效日為必填欄位');
  if (!Number.isInteger(submission) || submission < 1 || submission > 28) throw createApiError('VALIDATION_ERROR', '送件日必須介於 1 至 28 日');
  if (!Number.isInteger(paymentOffset) || paymentOffset < 0 || paymentOffset > 12) throw createApiError('VALIDATION_ERROR', '付款月份必須為本月至 12 個月後');
  if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 28) throw createApiError('VALIDATION_ERROR', '付款日必須介於 1 至 28 日');
  return { effectiveFrom: effectiveFrom, submissionDay: submission, paymentMonthOffset: paymentOffset, paymentDay: paymentDay };
}

function listBillingCycleRulesInternal(masterSs) {
  var sheet = masterSs.getSheetByName(SHEETS.BILLING_CYCLE_RULES);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMAS[SHEETS.BILLING_CYCLE_RULES].columns.length).getValues()
    .map(function (row) { return rowToObject(SHEETS.BILLING_CYCLE_RULES, row); })
    .filter(function (rule) { return rule.ruleId; })
    .map(function (rule) { rule.effectiveFrom = toIsoDate(rule.effectiveFrom); return rule; })
    .sort(function (a, b) { return String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)); });
}

function ensureDefaultBillingRule(masterSs) {
  var rules = listBillingCycleRulesInternal(masterSs);
  if (rules.length) return rules;
  var sheet = masterSs.getSheetByName(SHEETS.BILLING_CYCLE_RULES);
  var rule = { ruleId: 'BCR-DEFAULT', effectiveFrom: '1970-01-01', submissionDay: 20, paymentMonthOffset: 1, paymentDay: 15, createdAt: getCurrentTimestamp(), updatedAt: getCurrentTimestamp() };
  sheet.appendRow(objectToRow(SHEETS.BILLING_CYCLE_RULES, rule));
  return [rule];
}

function calculateBillingPeriodSnapshot(claimDate, rule) {
  var date = parseIsoDate(toIsoDate(claimDate));
  if (!date) throw createApiError('VALIDATION_ERROR', '請款日期必須為合法日期');
  var endYear = date.getFullYear();
  var endMonth = date.getMonth();
  var periodEnd = isoDateFromParts(endYear, endMonth + 1, 0);
  var periodStart = isoDateFromParts(endYear, endMonth, 1);
  var submissionDate = isoDateFromParts(endYear, endMonth, Number(rule.submissionDay));
  var expectedPaymentDate = isoDateFromParts(endYear, endMonth + Number(rule.paymentMonthOffset), Number(rule.paymentDay));
  if (expectedPaymentDate < submissionDate) throw createApiError('VALIDATION_ERROR', '預計付款日不得早於送件日');
  return {
    billingPeriodId: 'BPR-' + endYear + ('0' + (endMonth + 1)).slice(-2),
    claimPeriodKey: endYear + '-' + ('0' + (endMonth + 1)).slice(-2),
    ruleId: rule.ruleId,
    periodName: endYear + ' 年 ' + (endMonth + 1) + ' 月請款',
    periodStart: periodStart,
    periodEnd: periodEnd,
    submissionDate: submissionDate,
    expectedPaymentDate: expectedPaymentDate,
    status: 'open',
  };
}

function listBillingPeriodsInternal(masterSs) {
  var sheet = masterSs.getSheetByName(SHEETS.BILLING_PERIODS);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMAS[SHEETS.BILLING_PERIODS].columns.length).getValues()
    .map(function (row) { return rowToObject(SHEETS.BILLING_PERIODS, row); })
    .filter(function (item) { return item.billingPeriodId; })
    .map(function (item) { item.periodStart = toIsoDate(item.periodStart); item.periodEnd = toIsoDate(item.periodEnd); item.submissionDate = toIsoDate(item.submissionDate); item.expectedPaymentDate = toIsoDate(item.expectedPaymentDate); return item; });
}

function rangesOverlap(startA, endA, startB, endB) { return startA <= endB && startB <= endA; }

function getOrCreateBillingPeriod(claimDate) {
  var masterSs = getMasterDatabase();
  var candidateRules = ensureDefaultBillingRule(masterSs).filter(function (candidate) { return String(candidate.effectiveFrom) <= toIsoDate(claimDate); });
  var tentativeRule = candidateRules.length ? candidateRules[candidateRules.length - 1] : ensureDefaultBillingRule(masterSs)[0];
  var snapshot = calculateBillingPeriodSnapshot(claimDate, tentativeRule);
  var periods = listBillingPeriodsInternal(masterSs);
  var existing = periods.filter(function (period) { return period.billingPeriodId === snapshot.billingPeriodId; })[0];
  if (existing) return existing;
  var overlaps = periods.filter(function (period) { return rangesOverlap(snapshot.periodStart, snapshot.periodEnd, period.periodStart, period.periodEnd); });
  if (overlaps.length) throw createApiError('VALIDATION_ERROR', '新請款週期與既有期別重疊，請先由管理者修正單一期別');
  snapshot.createdAt = getCurrentTimestamp();
  snapshot.updatedAt = getCurrentTimestamp();
  masterSs.getSheetByName(SHEETS.BILLING_PERIODS).appendRow(objectToRow(SHEETS.BILLING_PERIODS, snapshot));
  return snapshot;
}

function handleListBillingCycleRules(payload) { return ensureDefaultBillingRule(getMasterDatabase()); }
function handleListBillingPeriods(payload) {
  var periods = listBillingPeriodsInternal(getMasterDatabase());
  return periods.sort(function (a, b) { return String(b.periodEnd).localeCompare(String(a.periodEnd)); });
}

function handlePreviewBillingCycleRule(payload) {
  var input = validateBillingRuleInput(payload || {});
  var masterSs = getMasterDatabase();
  var existing = listBillingPeriodsInternal(masterSs);
  var preview = calculateBillingPeriodSnapshot(input.effectiveFrom, { ruleId: 'PREVIEW', submissionDay: input.submissionDay, paymentMonthOffset: input.paymentMonthOffset, paymentDay: input.paymentDay });
  var overlaps = existing.filter(function (period) { return rangesOverlap(preview.periodStart, preview.periodEnd, period.periodStart, period.periodEnd); });
  return { proposed: preview, historicalPeriodsUnchanged: true, existingClaimsUnchanged: true, overlaps: overlaps.map(function (item) { return item.periodName; }), requiresCoverageConfirmation: false, coverageWarning: '' };
}

function handleSaveBillingCycleRule(payload) {
  var input = validateBillingRuleInput(payload || {});
  var preview = handlePreviewBillingCycleRule(input);
  if (preview.overlaps.length) throw createApiError('VALIDATION_ERROR', '新規則會與既有請款期別重疊：' + preview.overlaps.join('、'));
  var masterSs = getMasterDatabase();
  var sheet = masterSs.getSheetByName(SHEETS.BILLING_CYCLE_RULES);
  var sameDate = listBillingCycleRulesInternal(masterSs).filter(function (rule) { return rule.effectiveFrom === input.effectiveFrom; });
  if (sameDate.length) throw createApiError('VALIDATION_ERROR', '同一生效日已有請款週期規則，請改用另一個生效日');
  var rule = { ruleId: 'BCR-' + input.effectiveFrom.replace(/-/g, ''), effectiveFrom: input.effectiveFrom, submissionDay: input.submissionDay, paymentMonthOffset: input.paymentMonthOffset, paymentDay: input.paymentDay, createdAt: getCurrentTimestamp(), updatedAt: getCurrentTimestamp() };
  sheet.appendRow(objectToRow(SHEETS.BILLING_CYCLE_RULES, rule));
  return rule;
}

function handleGetBillingPeriodReport(payload) {
  var periodId = payload && payload.billingPeriodId ? String(payload.billingPeriodId) : '';
  var periodKey = payload && payload.claimPeriodKey ? String(payload.claimPeriodKey) : '';
  var year = payload && payload.year ? Number(payload.year) : getCurrentYear();
  if (!periodId && !periodKey) throw createApiError('VALIDATION_ERROR', '請款期別為必填欄位');
  var period = listBillingPeriodsInternal(getMasterDatabase()).filter(function (item) { return item.billingPeriodId === periodId || item.claimPeriodKey === periodKey; })[0];
  if (!period) throw createApiError('NOT_FOUND', '找不到請款期別');
  var forms = handleListForms({ year: year, formType: 'payment_request' }).filter(function (form) { return String(form.billingPeriodId || '') === String(period.billingPeriodId); });
  var valid = forms.filter(function (form) { var status = String(form.status || '').toLowerCase(); return status === 'submitted' || status === 'approved' || status === 'paid'; });
  function sumBy(key) { var map = {}; valid.forEach(function (form) { var name = form[key] || '未指定'; map[name] = (map[name] || 0) + (Number(form.amount) || 0); }); return Object.keys(map).map(function (name) { return { name: name, amount: map[name] }; }); }
  return { period: period, rows: forms, claimCount: valid.length, totalAmount: valid.reduce(function (sum, form) { return sum + (Number(form.amount) || 0); }, 0), projectSubtotals: sumBy('projectName'), subProjectSubtotals: sumBy('subProjectName'), vendorSubtotals: sumBy('vendorName') };
}

function handleListMonthlyClaims(payload) { return handleGetBillingPeriodReport(payload); }

function handleGetFinancialSummary(payload) {
  var masterSs = openMasterDatabaseFast();
  var yearSheet = masterSs.getSheetByName(SHEETS.YEAR_CONFIG);
  var years = [getCurrentYear()];
  if (yearSheet && yearSheet.getLastRow() > 1) {
    yearSheet.getRange(2, 1, yearSheet.getLastRow() - 1, SCHEMAS[SHEETS.YEAR_CONFIG].columns.length).getValues().forEach(function (row) {
      var item = rowToObject(SHEETS.YEAR_CONFIG, row); var year = Number(item.year); if (year && years.indexOf(year) === -1) years.push(year);
    });
  }
  var projects = {}; var subProjects = {}; var orphanBudgetItemIds = [];
  function ensure(map, id) { if (!map[id]) map[id] = { totalBudget: 0, claimedAmount: 0, remainingBudget: 0 }; return map[id]; }
  years.forEach(function (year) {
    var ss = getYearDatabase(year); if (!ss) return;
    var budgetSheet = ss.getSheetByName(SHEETS.BUDGET_ITEMS);
    if (budgetSheet && budgetSheet.getLastRow() > 1) {
      budgetSheet.getRange(2, 1, budgetSheet.getLastRow() - 1, SCHEMAS[SHEETS.BUDGET_ITEMS].columns.length).getValues().forEach(function (row) {
        var budget = rowToObject(SHEETS.BUDGET_ITEMS, row);
        if (!budget.budgetItemId) return;
        if (!budget.subProjectId) { orphanBudgetItemIds.push(budget.budgetItemId); return; }
        ensure(projects, String(budget.projectId)).totalBudget += Number(budget.budgetAmount) || 0;
        ensure(subProjects, String(budget.subProjectId)).totalBudget += Number(budget.budgetAmount) || 0;
      });
    }
    var formSheet = ss.getSheetByName(SHEETS.FORMS);
    if (formSheet && formSheet.getLastRow() > 1) {
      formSheet.getRange(2, 1, formSheet.getLastRow() - 1, SCHEMAS[SHEETS.FORMS].columns.length).getValues().forEach(function (row) {
        var form = rowToObject(SHEETS.FORMS, row); var status = String(form.status || '').toLowerCase();
        if (form.formType !== 'payment_request' || !form.budgetItemId || (status !== 'submitted' && status !== 'approved' && status !== 'paid')) return;
        var amount = Number(form.amount) || 0;
        ensure(projects, String(form.projectId)).claimedAmount += amount;
        ensure(subProjects, String(form.subProjectId)).claimedAmount += amount;
      });
    }
  });
  Object.keys(projects).forEach(function (id) { projects[id].remainingBudget = projects[id].totalBudget - projects[id].claimedAmount; });
  Object.keys(subProjects).forEach(function (id) { subProjects[id].remainingBudget = subProjects[id].totalBudget - subProjects[id].claimedAmount; });
  return { projects: projects, subProjects: subProjects, orphanBudgetItemIds: orphanBudgetItemIds };
}

// ==========================================
// 5. Forms API
// ==========================================

function normalizeFormSnapshot(form) {
  ['periodStart', 'periodEnd', 'submissionDate', 'expectedPaymentDate'].forEach(function (key) {
    if (form[key]) form[key] = toIsoDate(form[key]);
  });
  return form;
}

function handleListForms(payload) {
  var year = (payload && payload.year) ? parseInt(payload.year, 10) : getCurrentYear();
  var formType = (payload && payload.formType) ? String(payload.formType).trim() : '';
  var projectId = (payload && payload.projectId) ? String(payload.projectId).trim() : '';
  var vendorId = (payload && payload.vendorId) ? String(payload.vendorId).trim() : '';
  var subProjectId = (payload && payload.subProjectId) ? String(payload.subProjectId).trim() : '';
  var status = (payload && payload.status) ? String(payload.status).trim() : '';

  // 純讀取 API：不得建立年度資料庫，若不存在直接回傳空陣列
  var yearSs = getYearDatabase(year);
  if (!yearSs) return [];

  var sheet = yearSs.getSheetByName(SHEETS.FORMS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var numCols = SCHEMAS[SHEETS.FORMS].columns.length;
  var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var forms = [];

  for (var i = 0; i < rows.length; i++) {
    var form = rowToObject(SHEETS.FORMS, rows[i]);
    normalizeFormSnapshot(form);
    if (form.formId) {
      if (formType && form.formType !== formType) continue;
      if (projectId && form.projectId !== projectId) continue;
      if (subProjectId && String(form.subProjectId || '') !== subProjectId) continue;
      if (vendorId && form.vendorId !== vendorId) continue;
      if (status && form.status !== status) continue;
      forms.push(form);
    }
  }

  return forms;
}

function handleGetForm(payload) {
  if (!payload || !payload.formId) {
    throw createApiError('VALIDATION_ERROR', '缺少表單編號 (formId)');
  }

  var formId = String(payload.formId).trim();
  var year = payload.year;

  // 若未提供 year，嘗試由 FRM-YYYY-XXXXXX 解析年份
  if (!year) {
    var match = formId.match(/^FRM-(\d{4})-/);
    if (match && match[1]) {
      year = parseInt(match[1], 10);
    } else {
      year = getCurrentYear();
    }
  }

  var yearSs = getYearDatabase(year);
  if (!yearSs) {
    throw createApiError('NOT_FOUND', '找不到表單年度資料庫: ' + year);
  }

  var sheet = yearSs.getSheetByName(SHEETS.FORMS);
  if (!sheet) {
    throw createApiError('NOT_FOUND', '找不到表單工作表');
  }

  var rowIndex = findRowIndexById(sheet, formId);
  if (rowIndex === -1) {
    throw createApiError('NOT_FOUND', '找不到表單: ' + formId);
  }

  var numCols = SCHEMAS[SHEETS.FORMS].columns.length;
  var rowValues = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
  return normalizeFormSnapshot(rowToObject(SHEETS.FORMS, rowValues));
}

/**
 * 伺服器端請款預算權威檢查函式
 *
 * 驗證項目：
 * 1. BudgetItem 存在性 (找不到拋 NOT_FOUND)
 * 2. Relationship 一致性：payload.projectId 必須與 budgetItem.projectId 一致 (拋 VALIDATION_ERROR)
 * 3. BudgetItem 若指定 vendorId，payload.vendorId 必須一致 (拋 VALIDATION_ERROR)
 * 4. 金額合法性：payload.amount 必須為有限數字且 >= 0 (拋 VALIDATION_ERROR)
 * 5. 額度檢核：加總同年度 submitted/approved 請款 (排除 excludeFormId)，usedOther + requestedAmount <= effectiveBudget
 *
 * @param {number} year 預算年度
 * @param {Object} payload 儲存表單 payload
 * @param {string} [excludeFormId] 更新表單時需排除的 formId
 */
function validatePaymentBudget(year, payload, excludeFormId, isNewPayment) {
  var budgetItemId = payload.budgetItemId ? String(payload.budgetItemId).trim() : '';
  if (!budgetItemId) return;

  var yearSs = getYearDatabase(year);
  if (!yearSs) {
    throw createApiError('NOT_FOUND', '找不到該年度預算資料庫: ' + year);
  }

  var budgetSheet = yearSs.getSheetByName(SHEETS.BUDGET_ITEMS);
  if (!budgetSheet) {
    throw createApiError('NOT_FOUND', '找不到預算項目工作表');
  }

  var budgetRowIndex = findRowIndexById(budgetSheet, budgetItemId);
  if (budgetRowIndex === -1) {
    throw createApiError('NOT_FOUND', '找不到預算項目: ' + budgetItemId);
  }

  var numCols = SCHEMAS[SHEETS.BUDGET_ITEMS].columns.length;
  var budgetRowValues = budgetSheet.getRange(budgetRowIndex, 1, 1, numCols).getValues()[0];
  var budgetItem = rowToObject(SHEETS.BUDGET_ITEMS, budgetRowValues);

  if (isNewPayment && !isActiveStatus(budgetItem.status)) throw createApiError('VALIDATION_ERROR', '預算項目已結案，不可建立新的有預算請款');

  // 1. 專案關聯驗證
  var payloadProjectId = payload.projectId
    ? String(payload.projectId).trim()
    : '';

  var budgetProjectId = budgetItem.projectId
    ? String(budgetItem.projectId).trim()
    : '';

  if (!payloadProjectId) {
    throw createApiError(
      'VALIDATION_ERROR',
      '有預算請款必須提供專案編號'
    );
  }

  if (payloadProjectId !== budgetProjectId) {
    throw createApiError(
      'VALIDATION_ERROR',
      '請款專案編號與預算項目所屬專案不符'
    );
  }

  var payloadSubProjectId = payload.subProjectId ? String(payload.subProjectId).trim() : '';
  var budgetSubProjectId = budgetItem.subProjectId ? String(budgetItem.subProjectId).trim() : '';
  if (!payloadSubProjectId || payloadSubProjectId !== budgetSubProjectId) {
    throw createApiError('VALIDATION_ERROR', '請款分案與預算項目所屬分案不符');
  }

  // 2. 廠商指定關聯驗證 (若項目有指定廠商)
  if (budgetItem.vendorId && String(budgetItem.vendorId).trim() !== '') {
    if (!payload.vendorId || String(payload.vendorId).trim() !== String(budgetItem.vendorId).trim()) {
      throw createApiError('VALIDATION_ERROR', '請款廠商與預算項目指定承攬廠商不符');
    }
  }

  // 3. 請求金額驗證
  var requestedAmount = Number(payload.amount);
  if (isNaN(requestedAmount) || !isFinite(requestedAmount) || requestedAmount < 0) {
    throw createApiError('VALIDATION_ERROR', '請款金額必須為大於或等於 0 的有效數值');
  }

  // 4. 計算預算有效額度
  var bAmount = Number(budgetItem.budgetAmount) || 0;
  var tAmount = Number(budgetItem.terminatedAmount) || 0;
  var effectiveBudget = Math.max(0, bAmount - tAmount);

  // 5. 掃描同年度表單加總已消耗預算
  var formsSheet = yearSs.getSheetByName(SHEETS.FORMS);
  var usedOther = 0;

  if (formsSheet && formsSheet.getLastRow() > 1) {
    var formCols = SCHEMAS[SHEETS.FORMS].columns.length;
    var formRows = formsSheet.getRange(2, 1, formsSheet.getLastRow() - 1, formCols).getValues();

    for (var i = 0; i < formRows.length; i++) {
      var f = rowToObject(SHEETS.FORMS, formRows[i]);
      if (f.formType !== 'payment_request') continue;
      if (String(f.budgetItemId).trim() !== budgetItemId) continue;

      var st = (f.status || '').toLowerCase();
      if (st !== 'submitted' && st !== 'approved') continue;

      // 核心防線：排除自己 (編輯既有表單時)
      if (excludeFormId && String(f.formId).trim() === String(excludeFormId).trim()) continue;

      var amt = Number(f.amount);
      if (isFinite(amt) && amt > 0) {
        usedOther += amt;
      }
    }
  }

  // 6. 額度上限超額判定
  if (usedOther + requestedAmount > effectiveBudget) {
    var remaining = effectiveBudget - usedOther;
    throw createApiError(
      'VALIDATION_ERROR',
      '本次請款將超過可用預算（有效預算: ' + effectiveBudget + '，已請款: ' + usedOther + '，可用餘額: ' + remaining + '，本次請款: ' + requestedAmount + '）'
    );
  }
}

function handleSaveForm(payload) {
  if (!payload) throw createApiError('VALIDATION_ERROR', '缺少請求內容 (payload)');
  if (!payload.formType || (payload.formType !== 'payment_request' && payload.formType !== 'seal_approval')) {
    throw createApiError('VALIDATION_ERROR', '無效或未提供之表單類型 (formType: payment_request / seal_approval)');
  }
  if (!payload.company || String(payload.company).trim() === '') {
    throw createApiError('VALIDATION_ERROR', '公司名稱 (company) 為必填欄位');
  }

  var year = payload.year ? parseInt(payload.year, 10) : getCurrentYear();
  var formId = payload.formId ? String(payload.formId).trim() : '';
  var isBudgetedPayment = (
    payload.formType === 'payment_request'
    && payload.budgetType === 'budgeted'
  );
  var budgetItemId = payload.budgetItemId
    ? String(payload.budgetItemId).trim()
    : '';
  var subProjectId = payload.subProjectId ? String(payload.subProjectId).trim() : '';
  var billingPeriod = null;

  if (payload.formType === 'payment_request') {
    if (!payload.projectId || String(payload.projectId).trim() === '') throw createApiError('VALIDATION_ERROR', '請款表單必須提供專案編號');
    if (!subProjectId) throw createApiError('VALIDATION_ERROR', '新請款表單必須提供分案編號');
    var masterFormSs = openMasterDatabaseFast();
    var formProjectSheet = masterFormSs.getSheetByName(SHEETS.PROJECTS);
    var formProjectRow = findRowIndexById(formProjectSheet, String(payload.projectId).trim());
    if (formProjectRow === -1) throw createApiError('NOT_FOUND', '找不到專案編號: ' + payload.projectId);
    var formProject = rowToObject(SHEETS.PROJECTS, formProjectSheet.getRange(formProjectRow, 1, 1, SCHEMAS[SHEETS.PROJECTS].columns.length).getValues()[0]);
    var formSubSheet = masterFormSs.getSheetByName(SHEETS.SUB_PROJECTS);
    var formSubRow = findRowIndexById(formSubSheet, subProjectId);
    if (formSubRow === -1) throw createApiError('NOT_FOUND', '找不到分案編號: ' + subProjectId);
    var formSub = rowToObject(SHEETS.SUB_PROJECTS, formSubSheet.getRange(formSubRow, 1, 1, SCHEMAS[SHEETS.SUB_PROJECTS].columns.length).getValues()[0]);
    if (String(formSub.projectId) !== String(payload.projectId).trim()) throw createApiError('VALIDATION_ERROR', '請款表單專案與分案不符');
    if (!formId && (!isActiveStatus(formProject.status) || !isActiveStatus(formSub.status))) throw createApiError('VALIDATION_ERROR', '專案或分案已結案，不可建立新的請款');
    var rawPaymentPayload = payload.payloadJson;
    if (typeof rawPaymentPayload === 'string') { try { rawPaymentPayload = JSON.parse(rawPaymentPayload); } catch (ignore) { rawPaymentPayload = {}; } }
    billingPeriod = getOrCreateBillingPeriod((rawPaymentPayload && rawPaymentPayload.applyDate) || payload.claimDate || toIsoDate(new Date()));
  }

  if (isBudgetedPayment && !budgetItemId) {
    throw createApiError(
      'VALIDATION_ERROR',
      '有預算請款必須提供預算項目編號'
    );
  }
  if (isBudgetedPayment && !subProjectId) throw createApiError('VALIDATION_ERROR', '有預算請款必須提供分案編號');

  // Concurrency 防線：針對更新既有表單 (formId) 或有預算請款儲存，使用 LockService
  var needsLock = Boolean(formId) || isBudgetedPayment;
  var lock = null;
  if (needsLock && typeof LockService !== 'undefined' && LockService.getScriptLock) {
    try {
      lock = LockService.getScriptLock();
      if (lock) {
        lock.waitLock(30000);
      }
    } catch (lockErr) {
      throw createApiError('INTERNAL_ERROR', '系統資料庫忙碌中，請稍候重試');
    }
  }

  try {
    // FormRecord 新增 Snapshot 欄位前，先安全補齊既有年度工作表 Header。
    var yearSs = createYearDatabase(year);
    var sheet = yearSs.getSheetByName(SHEETS.FORMS);

    // 安全轉換 payloadJson，防止 [object Object] 寫入
    var payloadJsonStr = '';
    if (payload.payloadJson !== undefined && payload.payloadJson !== null) {
      if (typeof payload.payloadJson === 'string') {
        payloadJsonStr = payload.payloadJson;
      } else {
        try {
          payloadJsonStr = JSON.stringify(payload.payloadJson);
        } catch (e) {
          payloadJsonStr = '{}';
        }
      }
    }

    var amount = Number(payload.amount) || 0;

    if (formId) {
      // 1. Authoritative read (在 Lock 內讀取權威現況)
      var rowIndex = findRowIndexById(sheet, formId);
      if (rowIndex === -1) {
        throw createApiError('NOT_FOUND', '找不到表單編號: ' + formId);
      }

      var numCols = SCHEMAS[SHEETS.FORMS].columns.length;
      var existingRow = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
      var existingObj = rowToObject(SHEETS.FORMS, existingRow);
      normalizeFormSnapshot(existingObj);

      if (payload.formType === 'payment_request' && (String(payload.projectId || '') !== String(existingObj.projectId || '') || String(payload.subProjectId || '') !== String(existingObj.subProjectId || ''))) {
        throw createApiError('VALIDATION_ERROR', '既有請款不得變更專案或分案歸屬');
      }
      if (payload.formType === 'payment_request' && String(payload.budgetItemId || '') !== String(existingObj.budgetItemId || '')) {
        throw createApiError('VALIDATION_ERROR', '既有請款不得變更預算項目歸屬');
      }

      // 2. Version check (樂觀併發防護)
      var currentVersion = Number(existingObj.version) || 1;
      var expVer = payload.expectedVersion !== undefined && payload.expectedVersion !== null
        ? Number(payload.expectedVersion)
        : null;

      if (expVer === null || isNaN(expVer) || expVer <= 0 || !Number.isInteger(expVer) || expVer !== currentVersion) {
        throw createApiError(
          'VERSION_CONFLICT',
          '此表單已由其他使用者更新，為避免覆蓋最新資料，請重新載入後再編輯。'
        );
      }

      // 3. 執行伺服器端預算權威驗證
      if (isBudgetedPayment) {
        validatePaymentBudget(year, payload, formId, false);
      }

      var updatedObj = {
        formId: existingObj.formId,
        formType: payload.formType || existingObj.formType,
        status: payload.status || existingObj.status,
        createdAt: existingObj.createdAt,
        updatedAt: getCurrentTimestamp(),
        createdBy: payload.createdBy !== undefined ? payload.createdBy : existingObj.createdBy,
        company: existingObj.company,
        projectId: existingObj.projectId,
        projectName: existingObj.projectName,
        subProjectId: existingObj.subProjectId || '',
        subProjectName: existingObj.subProjectName || '',
        vendorId: payload.vendorId !== undefined ? payload.vendorId : existingObj.vendorId,
        vendorName: payload.vendorName !== undefined ? payload.vendorName : existingObj.vendorName,
        vendorTaxId: payload.vendorTaxId !== undefined ? payload.vendorTaxId : existingObj.vendorTaxId,
        budgetType: payload.budgetType || existingObj.budgetType || 'budgeted',
        budgetItemId: existingObj.budgetItemId,
        amount: payload.amount !== undefined ? amount : existingObj.amount,
        payloadJson: payloadJsonStr || existingObj.payloadJson,
        excelFileId: payload.excelFileId !== undefined ? payload.excelFileId : existingObj.excelFileId,
        pdfFileId: payload.pdfFileId !== undefined ? payload.pdfFileId : existingObj.pdfFileId,
        version: currentVersion + 1,
        // 已建立表單必須沿用原 Snapshot，避免修改目前規則或重開表單時歷史漂移。
        billingPeriodId: existingObj.billingPeriodId || (billingPeriod ? billingPeriod.billingPeriodId : ''),
        claimPeriodKey: existingObj.claimPeriodKey || (billingPeriod ? billingPeriod.claimPeriodKey : ''),
        periodName: existingObj.periodName || (billingPeriod ? billingPeriod.periodName : ''),
        periodStart: existingObj.periodStart || (billingPeriod ? billingPeriod.periodStart : ''),
        periodEnd: existingObj.periodEnd || (billingPeriod ? billingPeriod.periodEnd : ''),
        submissionDate: existingObj.submissionDate || (billingPeriod ? billingPeriod.submissionDate : ''),
        expectedPaymentDate: existingObj.expectedPaymentDate || (billingPeriod ? billingPeriod.expectedPaymentDate : ''),
      };

      var updatedRow = objectToRow(SHEETS.FORMS, updatedObj);
      sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
      return updatedObj;
    } else {
      // 新增表單
      // 執行伺服器端預算權威驗證
      if (isBudgetedPayment) {
        validatePaymentBudget(year, payload, undefined, true);
      }

      var newFormId = getNextId(ID_TYPES.FORM, year);
      var newFormObj = {
        formId: newFormId,
        formType: payload.formType,
        status: payload.status ? String(payload.status).trim() : 'draft',
        createdAt: getCurrentTimestamp(),
        updatedAt: getCurrentTimestamp(),
        createdBy: payload.createdBy ? String(payload.createdBy).trim() : '',
        company: formProject ? formProject.company : String(payload.company).trim(),
        projectId: payload.projectId ? String(payload.projectId).trim() : '',
        projectName: formProject ? formProject.projectName : (payload.projectName ? String(payload.projectName).trim() : ''),
        subProjectId: subProjectId,
        subProjectName: formSub ? formSub.subProjectName : (payload.subProjectName ? String(payload.subProjectName).trim() : ''),
        vendorId: payload.vendorId ? String(payload.vendorId).trim() : '',
        vendorName: payload.vendorName ? String(payload.vendorName).trim() : '',
        vendorTaxId: payload.vendorTaxId ? String(payload.vendorTaxId).trim() : '',
        budgetType: payload.budgetType ? String(payload.budgetType).trim() : 'budgeted',
        budgetItemId: payload.budgetItemId ? String(payload.budgetItemId).trim() : '',
        amount: amount,
        payloadJson: payloadJsonStr,
        excelFileId: payload.excelFileId ? String(payload.excelFileId).trim() : '',
        pdfFileId: payload.pdfFileId ? String(payload.pdfFileId).trim() : '',
        version: 1,
        billingPeriodId: billingPeriod ? billingPeriod.billingPeriodId : '',
        claimPeriodKey: billingPeriod ? billingPeriod.claimPeriodKey : '',
        periodName: billingPeriod ? billingPeriod.periodName : '',
        periodStart: billingPeriod ? billingPeriod.periodStart : '',
        periodEnd: billingPeriod ? billingPeriod.periodEnd : '',
        submissionDate: billingPeriod ? billingPeriod.submissionDate : '',
        expectedPaymentDate: billingPeriod ? billingPeriod.expectedPaymentDate : '',
      };

      var newRow = objectToRow(SHEETS.FORMS, newFormObj);
      sheet.appendRow(newRow);
      return newFormObj;
    }
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (relErr) {
        // 忽略 release 鎖之次要異常
      }
    }
  }
}

/**
 * 冪等取得或建立子資料夾（避免產生重複的 (1) 資料夾）
 * @param {GoogleAppsScript.Drive.Folder} parentFolder 上層資料夾
 * @param {string} name 子資料夾名稱
 * @return {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateChildFolder(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) {
      return f;
    }
  }
  return parentFolder.createFolder(name);
}

/**
 * 純唯讀尋找子資料夾（若不存在回傳 null，絕不建立資料夾）
 * @param {GoogleAppsScript.Drive.Folder} parentFolder 上層資料夾
 * @param {string} name 子資料夾名稱
 * @return {GoogleAppsScript.Drive.Folder|null}
 */
function findChildFolderByName(parentFolder, name) {
  if (!parentFolder || !parentFolder.getFoldersByName) return null;
  var it = parentFolder.getFoldersByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) {
      return f;
    }
  }
  return null;
}

/**
 * 專用內部輔助函式：僅更新 FormRecord 之 excelFileId, pdfFileId, updatedAt
 * 嚴禁調用 handleSaveForm（不遞增 version、不重跑預算商業邏輯）
 * @param {number} year 年度
 * @param {string} formId 表單編號
 * @param {string} excelFileId Excel 檔案 Drive ID
 * @param {string} pdfFileId PDF 檔案 Drive ID
 * @return {Object} 更新後之表單物件
 */
function updateFormArchivedFileIds(year, formId, excelFileId, pdfFileId) {
  var yearSs = getYearDatabase(year);
  if (!yearSs) {
    throw createApiError('NOT_FOUND', '找不到表單年度資料庫: ' + year);
  }

  var sheet = yearSs.getSheetByName(SHEETS.FORMS);
  if (!sheet) {
    throw createApiError('NOT_FOUND', '找不到表單工作表');
  }

  var rowIndex = findRowIndexById(sheet, formId);
  if (rowIndex === -1) {
    throw createApiError('NOT_FOUND', '找不到表單: ' + formId);
  }

  var numCols = SCHEMAS[SHEETS.FORMS].columns.length;
  var rowValues = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
  var existingObj = rowToObject(SHEETS.FORMS, rowValues);

  // 僅更新 excelFileId、pdfFileId 與 updatedAt，嚴格保留所有其他欄位與 version
  existingObj.excelFileId = String(excelFileId).trim();
  existingObj.pdfFileId = String(pdfFileId).trim();
  existingObj.updatedAt = getCurrentTimestamp();

  var updatedRow = objectToRow(SHEETS.FORMS, existingObj);
  sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
  return existingObj;
}

/**
 * Phase 2C-1 表單檔案雲端歸檔 API 處理器
 * @param {Object} payload 包含 formId, year, excel, pdf 之請求酬載
 */
function handleArchiveFormFiles(payload) {
  if (!payload || !payload.formId) {
    throw createApiError('VALIDATION_ERROR', '缺少表單編號 (formId)');
  }
  if (!payload.excel || !payload.excel.fileName || !payload.excel.base64 || !payload.excel.mimeType) {
    throw createApiError('VALIDATION_ERROR', '缺少 Excel/XLSM 檔案資訊或內容');
  }
  if (!payload.pdf || !payload.pdf.fileName || !payload.pdf.base64 || !payload.pdf.mimeType) {
    throw createApiError('VALIDATION_ERROR', '缺少 PDF 檔案資訊或內容');
  }

  var formId = String(payload.formId).trim();

  // 驗證 expectedVersion 必填且為正整數
  if (payload.expectedVersion === undefined || payload.expectedVersion === null || isNaN(Number(payload.expectedVersion)) || Number(payload.expectedVersion) <= 0 || !Number.isInteger(Number(payload.expectedVersion))) {
    throw createApiError('VALIDATION_ERROR', '缺少或無效之預期版本 (expectedVersion 必須為正整數)');
  }
  var expectedVersion = Number(payload.expectedVersion);

  var year = payload.year;
  if (!year) {
    var match = formId.match(/^FRM-(\d{4})-/);
    if (match && match[1]) {
      year = parseInt(match[1], 10);
    } else {
      year = getCurrentYear();
    }
  }

  // 讀取 authoritative FormRecord（不相信 client 傳來的 formType/version）
  var authoritativeForm = handleGetForm({ formId: formId, year: year });

  // 初次檢核版本：currentVersion 必須等於 expectedVersion
  var currentVersion = authoritativeForm.version ? Number(authoritativeForm.version) : 1;
  if (currentVersion !== expectedVersion) {
    throw createApiError('VERSION_CONFLICT', '此表單已由其他使用者更新，為避免覆蓋最新資料，請重新載入後再編輯。');
  }

  // 依據 authoritative formType 強制驗證 MIME 類型
  var expectedExcelMime = authoritativeForm.formType === 'payment_request'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.ms-excel.sheet.macroEnabled.12';

  if (payload.excel.mimeType !== expectedExcelMime) {
    throw createApiError(
      'VALIDATION_ERROR',
      'Excel MIME 類型不符: ' + payload.excel.mimeType + ' (預期: ' + expectedExcelMime + ')'
    );
  }
  if (payload.pdf.mimeType !== 'application/pdf') {
    throw createApiError('VALIDATION_ERROR', 'PDF MIME 類型不符: ' + payload.pdf.mimeType + ' (預期: application/pdf)');
  }

  var formTypeFolderName = authoritativeForm.formType === 'payment_request' ? '請款單' : '用印簽呈';

  // 依據階層取得／建立 Drive 資料夾（固定以 expectedVersion 建立資料夾）
  // DRIVE_ROOT_FOLDER_ID -> 表單歸檔 -> YYYY -> 請款單/用印簽呈 -> FORM_ID -> vVERSION
  // 短時間 ScriptLock 保護 folder resolve/create，防止併發請求重複建立兩個 vN 資料夾
  var folderLock = null;
  if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
    try {
      folderLock = LockService.getScriptLock();
      if (folderLock) {
        folderLock.waitLock(30000);
      }
    } catch (lockErr) {
      throw createApiError('INTERNAL_ERROR', '系統資料庫忙碌中，請稍候重試');
    }
  }

  var versionFolder = null;
  try {
    var rootFolderId = getDriveRootFolderId();
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var archiveRoot = getOrCreateChildFolder(rootFolder, '表單歸檔');
    var yearFolder = getOrCreateChildFolder(archiveRoot, String(year));
    var typeFolder = getOrCreateChildFolder(yearFolder, formTypeFolderName);
    var formFolder = getOrCreateChildFolder(typeFolder, formId);
    versionFolder = getOrCreateChildFolder(formFolder, 'v' + expectedVersion);
  } finally {
    if (folderLock) {
      try { folderLock.releaseLock(); } catch (e) {}
    }
  }

  var replacedExcelFileId = '';
  var replacedPdfFileId = '';
  var newExcelFile = null;
  var newPdfFile = null;

  try {
    // 建立新 Excel/XLSM 檔案
    var excelBytes = Utilities.base64Decode(payload.excel.base64);
    var excelBlob = Utilities.newBlob(excelBytes, payload.excel.mimeType, payload.excel.fileName);
    newExcelFile = versionFolder.createFile(excelBlob);

    // 建立新 PDF 檔案
    var pdfBytes = Utilities.base64Decode(payload.pdf.base64);
    var pdfBlob = Utilities.newBlob(pdfBytes, payload.pdf.mimeType, payload.pdf.fileName);
    newPdfFile = versionFolder.createFile(pdfBlob);

    // 取得 ScriptLock，執行最終 CAS 防線（避免產檔期間被另一請求插入 saveForm）
    var archiveLock = null;
    if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
      try {
        archiveLock = LockService.getScriptLock();
        if (archiveLock) {
          archiveLock.waitLock(30000);
        }
      } catch (lockErr) {
        throw createApiError('INTERNAL_ERROR', '系統資料庫忙碌中，請稍候重試');
      }
    }

    try {
      // 再次 authoritative read，確保版本未被更動
      var secondCheckForm = handleGetForm({ formId: formId, year: year });
      var secondVersion = secondCheckForm.version ? Number(secondCheckForm.version) : 1;
      if (secondVersion !== expectedVersion) {
        throw createApiError('VERSION_CONFLICT', '此表單已由其他使用者更新，為避免覆蓋最新資料，請重新載入後再編輯。');
      }

      // 記錄本次 CAS 真正被取代的 authoritative 檔案 ID（避免併發重試下殘留孤兒檔案）
      replacedExcelFileId = secondCheckForm.excelFileId ? String(secondCheckForm.excelFileId).trim() : '';
      replacedPdfFileId = secondCheckForm.pdfFileId ? String(secondCheckForm.pdfFileId).trim() : '';

      // 原子性更新 FormRecord
      updateFormArchivedFileIds(year, formId, newExcelFile.getId(), newPdfFile.getId());
    } finally {
      if (archiveLock) {
        try { archiveLock.releaseLock(); } catch (e) {}
      }
    }
  } catch (archiveErr) {
    // 原子性回滾：若任何步驟失敗（含 CAS 版本衝突），trash 本次新建立的檔案，絕不更動 FormRecord 與舊檔案
    if (newExcelFile) {
      try { newExcelFile.setTrashed(true); } catch (e) {}
    }
    if (newPdfFile) {
      try { newPdfFile.setTrashed(true); } catch (e) {}
    }
    throw archiveErr;
  }

  // 成功後：優先僅清理位於「同一版本資料夾」內之本次真正被取代的先前檔案 pair，跨版本舊檔案永久保留！
  if (replacedExcelFileId && replacedExcelFileId !== newExcelFile.getId()) {
    try {
      var oldExcelFile = DriveApp.getFileById(replacedExcelFileId);
      var isSameVer = false;
      var parentsIt = oldExcelFile.getParents ? oldExcelFile.getParents() : null;
      if (parentsIt && parentsIt.hasNext()) {
        if (parentsIt.next().getId() === versionFolder.getId()) {
          isSameVer = true;
        }
      } else if (oldExcelFile.parentFolderId) {
        if (oldExcelFile.parentFolderId === versionFolder.getId()) {
          isSameVer = true;
        }
      }
      if (isSameVer) {
        oldExcelFile.setTrashed(true);
      }
    } catch (cleanExcelErr) {}
  }
  if (replacedPdfFileId && replacedPdfFileId !== newPdfFile.getId()) {
    try {
      var oldPdfFile = DriveApp.getFileById(replacedPdfFileId);
      var isSameVerPdf = false;
      var parentsItPdf = oldPdfFile.getParents ? oldPdfFile.getParents() : null;
      if (parentsItPdf && parentsItPdf.hasNext()) {
        if (parentsItPdf.next().getId() === versionFolder.getId()) {
          isSameVerPdf = true;
        }
      } else if (oldPdfFile.parentFolderId) {
        if (oldPdfFile.parentFolderId === versionFolder.getId()) {
          isSameVerPdf = true;
        }
      }
      if (isSameVerPdf) {
        oldPdfFile.setTrashed(true);
      }
    } catch (cleanPdfErr) {}
  }

  return {
    formId: formId,
    version: expectedVersion,
    excelFileId: newExcelFile.getId(),
    pdfFileId: newPdfFile.getId(),
    excelFileName: payload.excel.fileName,
    pdfFileName: payload.pdf.fileName,
  };
}

/**
 * 依據表單編號、檔案類型與可選版本安全取得已歸檔檔案內容
 * @param {Object} payload { formId: string, fileType: 'excel' | 'pdf', year?: number, version?: number }
 */
function handleGetArchivedFormFile(payload) {
  if (!payload || !payload.formId) {
    throw createApiError('VALIDATION_ERROR', '缺少表單編號 (formId)');
  }
  if (!payload.fileType || (payload.fileType !== 'excel' && payload.fileType !== 'pdf')) {
    throw createApiError('VALIDATION_ERROR', '無效或未指定之檔案類型 (fileType: excel / pdf)');
  }

  var formId = String(payload.formId).trim();
  var year = payload.year;
  if (!year) {
    var match = formId.match(/^FRM-(\d{4})-/);
    if (match && match[1]) {
      year = parseInt(match[1], 10);
    } else {
      year = getCurrentYear();
    }
  }

  // 讀取權威 FormRecord
  var formRecord = handleGetForm({ formId: formId, year: year });

  // 檢查是否有指定 version
  if (payload.version !== undefined && payload.version !== null && String(payload.version).trim() !== '') {
    // 驗證 version 必須為正整數
    var verNum = Number(payload.version);
    if (!Number.isInteger(verNum) || verNum <= 0) {
      throw createApiError('VALIDATION_ERROR', '版本號必須為正整數: ' + payload.version);
    }

    var formType = formRecord.formType;
    var formTypeFolderName = formType === 'payment_request' ? '請款單' : '用印簽呈';
    var expectedExcelMime = formType === 'payment_request'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel.sheet.macroEnabled.12';
    var targetMime = payload.fileType === 'excel' ? expectedExcelMime : 'application/pdf';

    // 依 Drive hierarchy 尋找檔案：DRIVE_ROOT_FOLDER_ID -> 表單歸檔 -> YYYY -> 請款單/用印簽呈 -> FORM_ID -> vVERSION
    var rootFolderId = getDriveRootFolderId();
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var archiveRoot = findChildFolderByName(rootFolder, '表單歸檔');
    if (!archiveRoot) {
      throw createApiError('NOT_FOUND', '找不到表單歸檔目錄');
    }
    var yearFolder = findChildFolderByName(archiveRoot, String(year));
    if (!yearFolder) {
      throw createApiError('NOT_FOUND', '找不到該年度之歸檔目錄: ' + year);
    }
    var typeFolder = findChildFolderByName(yearFolder, formTypeFolderName);
    if (!typeFolder) {
      throw createApiError('NOT_FOUND', '找不到該表單類型之歸檔目錄: ' + formTypeFolderName);
    }
    var formFolder = findChildFolderByName(typeFolder, formId);
    if (!formFolder) {
      throw createApiError('NOT_FOUND', '找不到該表單之歸檔目錄: ' + formId);
    }
    var versionFolder = findChildFolderByName(formFolder, 'v' + verNum);
    if (!versionFolder) {
      throw createApiError('NOT_FOUND', '找不到該表單版本目錄: v' + verNum);
    }

    // 在 versionFolder 內尋找對應 MIME 之 non-trashed file
    var filesIt = versionFolder.getFiles();
    var latestMatchFile = null;

    while (filesIt.hasNext()) {
      var candidateFile = filesIt.next();
      if (candidateFile.isTrashed()) continue;

      if (candidateFile.getMimeType() === targetMime) {
        var cTime = candidateFile.getDateCreated ? candidateFile.getDateCreated().getTime() : 0;
        if (!latestMatchFile || cTime > latestMatchFile.time) {
          latestMatchFile = { file: candidateFile, time: cTime };
        }
      }
    }

    if (!latestMatchFile) {
      throw createApiError('NOT_FOUND', '版本 v' + verNum + ' 中找不到對應的 ' + (payload.fileType === 'excel' ? 'Excel/XLSM' : 'PDF') + ' 檔案');
    }

    var selectedFile = latestMatchFile.file;
    var blob = selectedFile.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());

    return {
      fileName: selectedFile.getName(),
      mimeType: selectedFile.getMimeType() || blob.getContentType(),
      base64: base64,
    };
  }

  // version 未提供：完全保留 Phase 2C-1 向下相容行為
  var targetFileId = payload.fileType === 'excel' ? formRecord.excelFileId : formRecord.pdfFileId;

  if (!targetFileId || String(targetFileId).trim() === '') {
    throw createApiError('NOT_FOUND', '此表單尚未歸檔 ' + (payload.fileType === 'excel' ? 'Excel/XLSM' : 'PDF') + ' 檔案');
  }

  var file;
  try {
    file = DriveApp.getFileById(String(targetFileId).trim());
  } catch (e) {
    throw createApiError('NOT_FOUND', '找不到已歸檔的雲端檔案');
  }

  if (file.isTrashed && file.isTrashed()) {
    throw createApiError('NOT_FOUND', '已歸檔之雲端檔案已遭移除');
  }

  var blob = file.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());

  return {
    fileName: file.getName(),
    mimeType: file.getMimeType() || blob.getContentType(),
    base64: base64,
  };
}

/**
 * 查詢指定表單在 Google Drive 中的歷史歸檔版本列表（純唯讀）
 * @param {Object} payload { formId: string, year?: number }
 * @return {Array<Object>} 依 version 遞減排序的版本列表
 */
function handleListArchivedFormVersions(payload) {
  if (!payload || !payload.formId) {
    throw createApiError('VALIDATION_ERROR', '缺少表單編號 (formId)');
  }

  var formId = String(payload.formId).trim();
  var year = payload.year;
  if (!year) {
    var match = formId.match(/^FRM-(\d{4})-/);
    if (match && match[1]) {
      year = parseInt(match[1], 10);
    } else {
      year = getCurrentYear();
    }
  }

  // 1. 讀取權威 FormRecord
  var authoritativeForm = handleGetForm({ formId: formId, year: year });
  var formType = authoritativeForm.formType;
  var currentVersion = authoritativeForm.version ? Number(authoritativeForm.version) : 1;
  var formTypeFolderName = formType === 'payment_request' ? '請款單' : '用印簽呈';
  var expectedExcelMime = formType === 'payment_request'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.ms-excel.sheet.macroEnabled.12';

  // 2. 唯讀尋找 Drive 路徑：DRIVE_ROOT_FOLDER_ID -> 表單歸檔 -> YYYY -> 請款單/用印簽呈 -> FORM_ID
  var rootFolderId = getDriveRootFolderId();
  var rootFolder = DriveApp.getFolderById(rootFolderId);
  var archiveRoot = findChildFolderByName(rootFolder, '表單歸檔');
  if (!archiveRoot) return [];

  var yearFolder = findChildFolderByName(archiveRoot, String(year));
  if (!yearFolder) return [];

  var typeFolder = findChildFolderByName(yearFolder, formTypeFolderName);
  if (!typeFolder) return [];

  var formFolder = findChildFolderByName(typeFolder, formId);
  if (!formFolder) return [];

  // 3. 遍歷 FORM_ID 下之子資料夾，僅接受 /^v([1-9]\d*)$/
  var versionFoldersIt = formFolder.getFolders();
  var versionsList = [];

  while (versionFoldersIt.hasNext()) {
    var vFolder = versionFoldersIt.next();
    if (vFolder.isTrashed()) continue;

    var folderName = vFolder.getName();
    var vMatch = folderName.match(/^v([1-9]\d*)$/);
    if (!vMatch) continue;

    var verNum = parseInt(vMatch[1], 10);

    // 遍歷該 version folder 中的 non-trashed files
    var filesIt = vFolder.getFiles();
    var latestExcelFile = null;
    var latestPdfFile = null;

    while (filesIt.hasNext()) {
      var file = filesIt.next();
      if (file.isTrashed()) continue;

      var mime = file.getMimeType();
      var createdTime = file.getDateCreated ? file.getDateCreated().getTime() : 0;

      if (mime === expectedExcelMime) {
        if (!latestExcelFile || createdTime > latestExcelFile.time) {
          latestExcelFile = { file: file, time: createdTime };
        }
      } else if (mime === 'application/pdf') {
        if (!latestPdfFile || createdTime > latestPdfFile.time) {
          latestPdfFile = { file: file, time: createdTime };
        }
      }
    }

    // 計算 archivedAt：該版本有效 Excel/XLSM/PDF 中最新之 file created time
    var latestTimestamp = 0;
    if (latestExcelFile && latestExcelFile.time > latestTimestamp) {
      latestTimestamp = latestExcelFile.time;
    }
    if (latestPdfFile && latestPdfFile.time > latestTimestamp) {
      latestTimestamp = latestPdfFile.time;
    }

    var archivedAtStr = latestTimestamp > 0
      ? Utilities.formatDate(new Date(latestTimestamp), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss')
      : '';

    versionsList.push({
      version: verNum,
      isCurrent: verNum === currentVersion,
      excelAvailable: Boolean(latestExcelFile),
      pdfAvailable: Boolean(latestPdfFile),
      excelFileName: latestExcelFile ? latestExcelFile.file.getName() : undefined,
      pdfFileName: latestPdfFile ? latestPdfFile.file.getName() : undefined,
      archivedAt: archivedAtStr || undefined,
    });
  }

  // 4. 排序：version DESC
  versionsList.sort(function(a, b) {
    return b.version - a.version;
  });

  return versionsList;
}

