# 公司表單系統 GAS 後端資料架構 (Phase 2A-1)

本目錄包含公司表單系統的 Google Apps Script (GAS) 後端資料骨架原始碼。
系統採用「共用主檔資料庫」與「每年度獨立資料庫」的雙層架構，具備冪等性（Idempotency），保證初次或重複執行皆不產生重複 Spreadsheet 或 Sheet。

---

## 檔案結構

```text
gas/
├── Code.gs              # 主要入口函式：initializeSystem()、createYearDatabase(year)
├── Config.gs            # Script Properties 存取封裝與系統預設值
├── Schema.gs            # 中文 Sheet 名稱定義、欄位 Headers、純文字與數值格式設定
├── DatabaseService.gs   # 主檔資料庫與 Drive 試算表冪等建立與查詢
├── YearService.gs       # 年度資料庫動態建立、查詢與「年度設定」登記
├── Utils.gs             # 表格結構初始化、文字格式化防前置0、預設工作表清理
├── test/
│   ├── gas-mock.js      # 本地 Node.js 模擬 GAS 執行環境
│   └── test-phase2a1.js # 44 項自動化驗收測試腳本
└── README.md            # 本說明文件
```

---

## 資料庫與工作表 Schema

### 1. 共用主檔資料庫（名稱：`公司表單系統主檔資料庫`）

* **專案主檔** (`SHEETS.PROJECTS`)
  `projectId`, `company`, `projectName`, `status`, `createdAt`, `updatedAt`
* **廠商主檔** (`SHEETS.VENDORS`)
  `vendorId`, `vendorName`, `taxId`, `entityType`, `bankCode`, `bankName`, `branchCode`, `branchName`, `accountName`, `accountNumber`, `isActive`, `createdAt`, `updatedAt`
  *特別注意：`accountNumber`、`taxId`、`bankCode`、`branchCode` 強制設定為純文字格式 (`@`)，防範 `007` 變成 `7` 等前置 0 遺失問題。*
* **年度設定** (`SHEETS.YEAR_CONFIG`)
  `year`, `spreadsheetId`, `status`, `createdAt`, `archivedAt`
  *狀態：`active` 或 `archived`。後續 GAS 服務一律由這張表動態定位年度試算表，禁止寫死年度 ID。*

### 2. 每年度獨立資料庫（名稱例如：`2026公司表單資料庫`、`2027公司表單資料庫`）

* **預算項目** (`SHEETS.BUDGET_ITEMS`)
  `budgetItemId`, `year`, `projectId`, `company`, `projectName`, `itemName`, `vendorId`, `vendorName`, `budgetAmount`, `terminatedAmount`, `status`, `createdAt`, `updatedAt`
  *僅管理「有預算」項目。*
* **表單紀錄** (`SHEETS.FORMS`)
  `formId`, `formType`, `status`, `createdAt`, `updatedAt`, `createdBy`, `company`, `projectId`, `projectName`, `vendorId`, `vendorName`, `vendorTaxId`, `budgetType`, `budgetItemId`, `amount`, `payloadJson`, `excelFileId`, `pdfFileId`, `version`
  *涵蓋請款單 (`payment_request`) 與用印／簽呈 (`seal_approval`)。*
* **請款紀錄** (`SHEETS.CLAIMS`)
  `claimId`, `formId`, `year`, `claimPeriod`, `claimSequence`, `claimDate`, `company`, `projectId`, `projectName`, `vendorId`, `vendorName`, `vendorTaxId`, `budgetType`, `budgetItemId`, `itemName`, `unbudgetedReason`, `currentClaimAmount`, `retentionAmount`, `advanceOffsetAmount`, `penaltyAmount`, `payableAmount`, `status`, `createdAt`, `updatedAt`
  *每一次廠商請款即一筆獨立交易。*
  *有預算：`budgetType = budgeted`，`budgetItemId` 必填。*
  *無預算：`budgetType = unbudgeted`，`budgetItemId` 空白，`itemName` 必填，`unbudgetedReason` 可填。*
  *允許同一廠商同時有預算請款與無預算請款。*
* **付款紀錄** (`SHEETS.PAYMENTS`)
  `paymentId`, `claimId`, `formId`, `budgetType`, `budgetItemId`, `company`, `projectId`, `projectName`, `vendorId`, `vendorName`, `itemName`, `amount`, `status`, `paymentDate`, `year`, `month`, `createdAt`, `updatedAt`
  *包含 `claimId` 關聯欄位，支援一筆請款 (Claim) 拆分為一筆或多筆付款 (Payment)。*
  *狀態包含 `scheduled`、`paid`、`cancelled`，僅 `paid` 視為實際付款。*
* **異動紀錄** (`SHEETS.AUDIT_LOG`)
  `logId`, `timestamp`, `user`, `action`, `entityType`, `entityId`, `detailJson`

---

## 部署與設定流程

### 步驟 1：將程式碼放入 Google Apps Script 專案

1. 開啟您的 Standalone Google Apps Script 專案：`公司表單系統後端`。
2. 在 GAS 編輯器左側「檔案」清單中，建立對應的 6 個指令碼檔案並將本地原始碼複製貼上：
   - `Config.gs`
   - `Schema.gs`
   - `Utils.gs`
   - `DatabaseService.gs`
   - `YearService.gs`
   - `Code.gs`
3. 點擊「儲存專案 (Ctrl+S)」。

### 步驟 2：確認 Script Properties

進入 GAS 編輯器左側「專案設定 (Project Settings)」齒輪圖示，捲動至最下方的「指令碼屬性 (Script Properties)」，確認已包含：

| 屬性 (Property) | 範例值 / 說明 |
| :--- | :--- |
| `DRIVE_ROOT_FOLDER_ID` | 您在 Google Drive 建立的 `公司表單系統` 資料夾 ID |
| `SCHEMA_VERSION` | `1` |
| `APP_ENV` | `production` |

---

## 人工執行與 Google 授權步驟（初次執行必須）

在 Google Apps Script 中建立 Google Drive 檔案與試算表屬於敏感權限，Google 要求必須由帳號本人親自授權。

請依照下列步驟操作：

1. 在 GAS 編輯器上方工具列的函式下拉選單中，選擇 **`initializeSystem`**。
2. 點擊 **「執行 (Run)」** 按鈕。
3. 此時會彈出 **「需要授權 (Authorization Required)」** 視窗，請點擊 **「核對權限 (Review Permissions)」**。
4. 選擇您的 Google 帳號。
5. 若畫面顯示「Google 尚未驗證這個應用程式 (Google hasn't verified this app)」：
   - 點擊左下方的 **「進階 (Advanced)」**
   - 點擊最下方 **「前往「公司表單系統後端」（不安全）(Go to 公司表單系統後端 (unsafe))」**
6. 檢視要求的權限（查看與管理您的 Google 試算表及 Google 雲端硬碟檔案），點擊右下角 **「允許 (Allow)」**。
7. 授權完成後，GAS 會自動開始執行 `initializeSystem()`。

### 執行完成檢查：
- 查看下方「執行紀錄 (Execution Log)」，確認出現：
  - `主檔資料庫已確認，Spreadsheet ID: ...`
  - `目前運作年度: 2026`
  - `年度資料庫已確認，Spreadsheet ID: ...`
  - `=== 公司表單系統初始化完成 ===`
- 前往 Google Drive 的 `公司表單系統` 資料夾，即可看到已自動建立：
  1. `公司表單系統主檔資料庫`
  2. `2026公司表單資料庫`
- 進入「專案設定」查看「指令碼屬性」，會發現系統已自動登記：
  - `MASTER_SPREADSHEET_ID`
  - `CURRENT_YEAR`

---

## 本地測試執行

本專案提供無副作用的 Node.js 模擬測試：

```powershell
node gas/test/test-phase2a1.js
```

測試涵蓋 44 項業務規則、Schema 欄位完整度、文字格式保護、冪等性防重複建檔，以及 Claim-Payment 關聯模型。
