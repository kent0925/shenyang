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

    var updatedObj = {
      projectId: existingObj.projectId,
      company: payload.company || existingObj.company,
      projectName: payload.projectName || existingObj.projectName,
      status: payload.status || existingObj.status || 'active',
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

  if (vendorId) {
    // 更新廠商
    var rowIndex = findRowIndexById(sheet, vendorId);
    if (rowIndex === -1) {
      throw createApiError('NOT_FOUND', '找不到廠商編號: ' + vendorId);
    }

    var numCols = SCHEMAS[SHEETS.VENDORS].columns.length;
    var existingRow = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
    var existingObj = rowToObject(SHEETS.VENDORS, existingRow);

    var updatedObj = {
      vendorId: existingObj.vendorId,
      vendorName: payload.vendorName || existingObj.vendorName,
      taxId: cleanTaxId || existingObj.taxId,
      entityType: payload.entityType || existingObj.entityType || '公司',
      bankCode: cleanBankCode || existingObj.bankCode,
      bankName: payload.bankName || existingObj.bankName,
      branchCode: cleanBranchCode || existingObj.branchCode,
      branchName: payload.branchName || existingObj.branchName,
      accountName: payload.accountName || existingObj.accountName,
      accountNumber: cleanAccountNumber || existingObj.accountNumber,
      isActive: payload.isActive !== undefined ? payload.isActive : existingObj.isActive,
      createdAt: existingObj.createdAt,
      updatedAt: getCurrentTimestamp(),
    };

    var updatedRow = objectToRow(SHEETS.VENDORS, updatedObj);
    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    return updatedObj;
  } else {
    // 新增廠商
    var newVendorId = getNextId(ID_TYPES.VENDOR);
    var newVendorObj = {
      vendorId: newVendorId,
      vendorName: String(payload.vendorName).trim(),
      taxId: cleanTaxId,
      entityType: payload.entityType ? String(payload.entityType).trim() : '公司',
      bankCode: cleanBankCode,
      bankName: payload.bankName ? String(payload.bankName).trim() : '',
      branchCode: cleanBranchCode,
      branchName: payload.branchName ? String(payload.branchName).trim() : '',
      accountName: payload.accountName ? String(payload.accountName).trim() : '',
      accountNumber: cleanAccountNumber,
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
    };

    var newRow = objectToRow(SHEETS.VENDORS, newVendorObj);
    sheet.appendRow(newRow);
    return newVendorObj;
  }
}

// ==========================================
// 3. Budget Items API
// ==========================================

function handleListBudgetItems(payload) {
  var year = (payload && payload.year) ? parseInt(payload.year, 10) : getCurrentYear();
  var projectId = (payload && payload.projectId) ? String(payload.projectId).trim() : '';

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

  var year = payload.year ? parseInt(payload.year, 10) : getCurrentYear();
  var yearSs = getYearDatabase(year) || createYearDatabase(year);
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

    var updatedObj = {
      budgetItemId: existingObj.budgetItemId,
      year: String(year),
      projectId: payload.projectId !== undefined ? payload.projectId : existingObj.projectId,
      company: payload.company || existingObj.company,
      projectName: payload.projectName || existingObj.projectName,
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
    var newBudgetItemId = getNextId(ID_TYPES.BUDGET, year);
    var newBudgetItemObj = {
      budgetItemId: newBudgetItemId,
      year: String(year),
      projectId: payload.projectId ? String(payload.projectId).trim() : '',
      company: String(payload.company).trim(),
      projectName: String(payload.projectName).trim(),
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
// 4. Forms API
// ==========================================

function handleListForms(payload) {
  var year = (payload && payload.year) ? parseInt(payload.year, 10) : getCurrentYear();
  var formType = (payload && payload.formType) ? String(payload.formType).trim() : '';
  var projectId = (payload && payload.projectId) ? String(payload.projectId).trim() : '';
  var vendorId = (payload && payload.vendorId) ? String(payload.vendorId).trim() : '';
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
    if (form.formId) {
      if (formType && form.formType !== formType) continue;
      if (projectId && form.projectId !== projectId) continue;
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
  return rowToObject(SHEETS.FORMS, rowValues);
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
function validatePaymentBudget(year, payload, excludeFormId) {
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

  if (isBudgetedPayment && !budgetItemId) {
    throw createApiError(
      'VALIDATION_ERROR',
      '有預算請款必須提供預算項目編號'
    );
  }

  // Concurrency 防線：針對有預算之請款單儲存，使用 LockService 避免併發超額
  var lock = null;
  if (isBudgetedPayment && typeof LockService !== 'undefined' && LockService.getScriptLock) {
    try {
      lock = LockService.getScriptLock();
      if (lock) {
        lock.waitLock(30000);
      }
    } catch (lockErr) {
      throw createApiError('INTERNAL_ERROR', '預算資料庫忙碌中，請稍候重試');
    }
  }

  try {
    // 執行伺服器端預算權威驗證
    if (isBudgetedPayment) {
      validatePaymentBudget(year, payload, formId || undefined);
    }

    var yearSs = getYearDatabase(year) || createYearDatabase(year);
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
  var version = Number(payload.version) || 1;

  if (formId) {
    // 更新既有表單
    var rowIndex = findRowIndexById(sheet, formId);
    if (rowIndex === -1) {
      throw createApiError('NOT_FOUND', '找不到表單編號: ' + formId);
    }

    var numCols = SCHEMAS[SHEETS.FORMS].columns.length;
    var existingRow = sheet.getRange(rowIndex, 1, 1, numCols).getValues()[0];
    var existingObj = rowToObject(SHEETS.FORMS, existingRow);

    var updatedObj = {
      formId: existingObj.formId,
      formType: payload.formType || existingObj.formType,
      status: payload.status || existingObj.status,
      createdAt: existingObj.createdAt,
      updatedAt: getCurrentTimestamp(),
      createdBy: payload.createdBy !== undefined ? payload.createdBy : existingObj.createdBy,
      company: payload.company || existingObj.company,
      projectId: payload.projectId !== undefined ? payload.projectId : existingObj.projectId,
      projectName: payload.projectName !== undefined ? payload.projectName : existingObj.projectName,
      vendorId: payload.vendorId !== undefined ? payload.vendorId : existingObj.vendorId,
      vendorName: payload.vendorName !== undefined ? payload.vendorName : existingObj.vendorName,
      vendorTaxId: payload.vendorTaxId !== undefined ? payload.vendorTaxId : existingObj.vendorTaxId,
      budgetType: payload.budgetType || existingObj.budgetType || 'budgeted',
      budgetItemId: payload.budgetItemId !== undefined ? payload.budgetItemId : existingObj.budgetItemId,
      amount: payload.amount !== undefined ? amount : existingObj.amount,
      payloadJson: payloadJsonStr || existingObj.payloadJson,
      excelFileId: payload.excelFileId !== undefined ? payload.excelFileId : existingObj.excelFileId,
      pdfFileId: payload.pdfFileId !== undefined ? payload.pdfFileId : existingObj.pdfFileId,
      version: existingObj.version ? Number(existingObj.version) + 1 : version + 1,
    };

    var updatedRow = objectToRow(SHEETS.FORMS, updatedObj);
    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    return updatedObj;
  } else {
    // 新增表單（本階段只存表單紀錄，不自動新增 Claim）
    var newFormId = getNextId(ID_TYPES.FORM, year);
    var newFormObj = {
      formId: newFormId,
      formType: payload.formType,
      status: payload.status ? String(payload.status).trim() : 'draft',
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      createdBy: payload.createdBy ? String(payload.createdBy).trim() : '',
      company: String(payload.company).trim(),
      projectId: payload.projectId ? String(payload.projectId).trim() : '',
      projectName: payload.projectName ? String(payload.projectName).trim() : '',
      vendorId: payload.vendorId ? String(payload.vendorId).trim() : '',
      vendorName: payload.vendorName ? String(payload.vendorName).trim() : '',
      vendorTaxId: payload.vendorTaxId ? String(payload.vendorTaxId).trim() : '',
      budgetType: payload.budgetType ? String(payload.budgetType).trim() : 'budgeted',
      budgetItemId: payload.budgetItemId ? String(payload.budgetItemId).trim() : '',
      amount: amount,
      payloadJson: payloadJsonStr,
      excelFileId: payload.excelFileId ? String(payload.excelFileId).trim() : '',
      pdfFileId: payload.pdfFileId ? String(payload.pdfFileId).trim() : '',
      version: version,
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
