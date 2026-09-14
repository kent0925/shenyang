/**
 * gas-mock.js - 模擬 Google Apps Script 執行環境
 * 提供 PropertiesService, DriveApp, SpreadsheetApp, Logger 之記憶體模擬實作
 */

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = []; // 2D array
    this.frozenRows = 0;
    this.columnFormats = {}; // colIndex -> format string
    this.maxRows = 100;
  }

  getName() {
    return this.name;
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    if (this.rows.length === 0) return 0;
    return Math.max(...this.rows.map(r => r ? r.length : 0));
  }

  getMaxRows() {
    return this.maxRows;
  }

  insertRowsAfter(afterRow, numRows) {
    this.maxRows += numRows;
  }

  setFrozenRows(n) {
    this.frozenRows = n;
  }

  autoResizeColumn(col) {
    // 模擬 auto resize
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    const sheet = this;
    return {
      setValues(values) {
        for (let r = 0; r < numRows; r++) {
          const targetRowIdx = row - 1 + r;
          while (sheet.rows.length <= targetRowIdx) {
            sheet.rows.push([]);
          }
          for (let c = 0; c < numCols; c++) {
            const targetColIdx = col - 1 + c;
            sheet.rows[targetRowIdx][targetColIdx] = values[r][c];
          }
        }
      },
      getValues() {
        const result = [];
        for (let r = 0; r < numRows; r++) {
          const targetRowIdx = row - 1 + r;
          const rowData = sheet.rows[targetRowIdx] || [];
          const rowSlice = [];
          for (let c = 0; c < numCols; c++) {
            const targetColIdx = col - 1 + c;
            rowSlice.push(rowData[targetColIdx] !== undefined ? rowData[targetColIdx] : '');
          }
          result.push(rowSlice);
        }
        return result;
      },
      setValue(val) {
        this.setValues([[val]]);
      },
      setFontWeight(weight) {
        // 模擬 setFontWeight
      },
      setNumberFormat(format) {
        for (let c = 0; c < numCols; c++) {
          sheet.columnFormats[col + c] = format;
        }
      }
    };
  }

  getDataRange() {
    return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  appendRow(rowValues) {
    this.rows.push([...rowValues]);
  }
}

class MockSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.locale = 'en_US'; // 預設英文語系
    this.timeZone = 'Etc/GMT'; // 預設時區
    this.sheets = [new MockSheet('工作表1')]; // Google Sheets 預設會有一張空白工作表
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  getSpreadsheetLocale() {
    return this.locale;
  }

  setSpreadsheetLocale(locale) {
    this.locale = locale;
  }

  getSpreadsheetTimeZone() {
    return this.timeZone;
  }

  setSpreadsheetTimeZone(timeZone) {
    this.timeZone = timeZone;
  }

  getSheets() {
    return [...this.sheets];
  }

  getSheetByName(name) {
    return this.sheets.find(s => s.getName() === name) || null;
  }

  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }

  deleteSheet(sheet) {
    const index = this.sheets.findIndex(s => s.getName() === sheet.getName());
    if (index !== -1 && this.sheets.length > 1) {
      this.sheets.splice(index, 1);
    }
  }
}

class MockFile {
  constructor(id, name, parentFolderId) {
    this.id = id;
    this.name = name;
    this.parentFolderId = parentFolderId;
    this.trashed = false;
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  isTrashed() {
    return this.trashed;
  }

  moveTo(targetFolder) {
    this.parentFolderId = targetFolder.getId();
  }
}

class MockFolder {
  constructor(id, name, driveContext) {
    this.id = id;
    this.name = name;
    this.driveContext = driveContext;
  }

  getId() {
    return this.id;
  }

  getName() {
    return this.name;
  }

  getFilesByName(name) {
    const files = Array.from(this.driveContext.files.values())
      .filter(f => f.parentFolderId === this.id && f.getName() === name && !f.isTrashed());
    let idx = 0;
    return {
      hasNext() {
        return idx < files.length;
      },
      next() {
        return files[idx++];
      }
    };
  }

  addFile(file) {
    file.parentFolderId = this.id;
  }
}

export function createGasEnvironment(initialProperties = {}) {
  const properties = { ...initialProperties };
  const spreadsheets = new Map(); // id -> MockSpreadsheet
  const files = new Map(); // id -> MockFile
  const folders = new Map(); // id -> MockFolder
  const rootFolderId = properties.DRIVE_ROOT_FOLDER_ID || 'mock-root-folder-id';
  
  const driveContext = { files, folders };
  const rootFolder = new MockFolder(rootFolderId, '公司表單系統', driveContext);
  folders.set(rootFolderId, rootFolder);

  let idCounter = 1000;

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(k) {
          return properties[k] !== undefined ? properties[k] : null;
        },
        setProperty(k, v) {
          properties[k] = String(v);
        },
        setProperties(obj) {
          Object.assign(properties, obj);
        },
        getProperties() {
          return { ...properties };
        }
      };
    }
  };

  const DriveApp = {
    getFolderById(id) {
      if (folders.has(id)) {
        return folders.get(id);
      }
      throw new Error(`找不到 Folder: ${id}`);
    },
    getFileById(id) {
      if (files.has(id)) {
        return files.get(id);
      }
      throw new Error(`找不到 File: ${id}`);
    },
    getRootFolder() {
      return rootFolder;
    }
  };

  const SpreadsheetApp = {
    create(name) {
      const id = 'ss_' + (idCounter++);
      const ss = new MockSpreadsheet(id, name);
      spreadsheets.set(id, ss);
      const file = new MockFile(id, name, rootFolderId);
      files.set(id, file);
      return ss;
    },
    open(file) {
      const ss = spreadsheets.get(file.getId());
      if (!ss) throw new Error(`Spreadsheet not found for file id: ${file.getId()}`);
      return ss;
    },
    openById(id) {
      const ss = spreadsheets.get(id);
      if (!ss) throw new Error(`Spreadsheet not found for id: ${id}`);
      return ss;
    }
  };

  const ContentService = {
    MimeType: {
      JSON: 'application/json',
      TEXT: 'text/plain',
    },
    createTextOutput(text) {
      let mimeType = 'text/plain';
      return {
        setMimeType(type) {
          mimeType = type;
          return this;
        },
        getContent() {
          return text;
        },
        getMimeType() {
          return mimeType;
        },
      };
    },
  };

  const LockService = {
    getScriptLock() {
      return {
        waitLock(timeout) {
          return true;
        },
        releaseLock() {
          return true;
        },
        hasLock() {
          return true;
        },
      };
    },
  };

  const Logger = {
    logs: [],
    log(...args) {
      this.logs.push(args.join(' '));
    },
    clear() {
      this.logs = [];
    }
  };

  return {
    PropertiesService,
    DriveApp,
    SpreadsheetApp,
    ContentService,
    LockService,
    Logger,
    _internal: {
      properties,
      spreadsheets,
      files,
      folders
    }
  };
}
