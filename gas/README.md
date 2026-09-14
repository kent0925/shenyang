# 公司表單系統 GAS 後端資料架構 (Phase 2A-1)

本目錄包含公司表單系統的 Google Apps Script (GAS) 後端資料骨架原始碼。
系統採用「共用主檔資料庫」與「每年度獨立資料庫」雙層架構，具備冪等性（Idempotency），保證初次或重複執行皆不產生重複 Spreadsheet 或 Sheet。

---

## 核心設計原則

1. **Google Sheets 介面全面繁體中文化**：
   - 包含 Sheet 分頁名稱與第一列欄位標頭（Header）全數使用繁體中文。
2. **程式內部一律維持英文**：
   - API JSON key、程式變數、資料模型等維持英文內部 key，透過 `rowToObject` / `objectToRow` 進行雙向安全轉換，不得依賴中文標頭作為物件屬性。
3. **資料格式與型別保護**：
   - 帳號、統編、金融機構代碼、分支機構代碼強制設定為純文字格式 (`@`)，徹底防範前置 0 消失（如 `007` 變成 `7`）。
   - 一般日期（如請款日期、付款日期）格式設定為 `yyyy/MM/dd`。
   - 日期時間（如建立時間、更新時間、異動時間）格式設定為 `yyyy/MM/dd HH:mm:ss`，並使用 JavaScript 原生 `new Date()` 寫入。
   - 試算表地區設定為 `zh_TW`，時區設定為 `Asia/Taipei`。
4. **平滑升級（Migration）機制**：
   - 重新執行 `initializeSystem()` 會自動偵測現有英文 Header 並平滑升級為中文 Header，且絕不會刪除或更動既有資料列。

---

## 檔案結構

```text
gas/
├── Code.gs              # 主要入口函式：initializeSystem()、createYearDatabase(year)
├── Config.gs            # Script Properties 存取封裝與系統預設值
├── Schema.gs            # 中文 Sheet 名稱、中文 Header、內部英文 Key 映射與雙向轉換工具
├── DatabaseService.gs   # 主檔資料庫與 Drive 試算表冪等建立、查詢與 Locale/TimeZone 設定
├── YearService.gs       # 年度資料庫動態建立、查詢與「年度設定」登記
├── Utils.gs             # 表格結構初始化、平滑升級、文字格式化防前置0、原生 Date 物件
├── test/
│   ├── gas-mock.js      # 本地 Node.js 模擬 GAS 執行環境 (含 Locale/TimeZone)
│   └── test-phase2a1.js # 42 項自動化驗收測試腳本
└── README.md            # 本說明文件
```

---

## 中文 Header ↔ 內部 Key 對照表

### 1. 共用主檔資料庫（`公司表單系統主檔資料庫`）

#### 專案主檔 (`專案主檔`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **專案編號** | `projectId` | 文字 (`@`) | |
| **公司** | `company` | 文字 (`@`) | |
| **專案名稱** | `projectName` | 文字 (`@`) | |
| **狀態** | `status` | 文字 (`@`) | |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **更新時間** | `updatedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |

#### 廠商主檔 (`廠商主檔`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **廠商編號** | `vendorId` | 文字 (`@`) | |
| **廠商名稱** | `vendorName` | 文字 (`@`) | |
| **統一編號** | `taxId` | 文字 (`@`) | 防前置 0 遺失 |
| **登記類型** | `entityType` | 文字 (`@`) | |
| **金融機構代碼** | `bankCode` | 文字 (`@`) | 防 007 變成 7 |
| **金融機構名稱** | `bankName` | 文字 (`@`) | |
| **分支機構代碼** | `branchCode` | 文字 (`@`) | 防前置 0 遺失 |
| **分支機構名稱** | `branchName` | 文字 (`@`) | |
| **戶名** | `accountName` | 文字 (`@`) | |
| **帳號** | `accountNumber` | 文字 (`@`) | 防前置 0 遺失 |
| **啟用狀態** | `isActive` | 布林 (`boolean`) | |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **更新時間** | `updatedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |

#### 年度設定 (`年度設定`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **年度** | `year` | 文字 (`@`) | |
| **試算表編號** | `spreadsheetId` | 文字 (`@`) | |
| **狀態** | `status` | 文字 (`@`) | active / archived |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **封存時間** | `archivedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |

---

### 2. 每年度獨立資料庫（例如 `2026公司表單資料庫`）

#### 預算項目 (`預算項目`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **預算項目編號** | `budgetItemId` | 文字 (`@`) | |
| **年度** | `year` | 文字 (`@`) | |
| **專案編號** | `projectId` | 文字 (`@`) | |
| **公司** | `company` | 文字 (`@`) | |
| **專案名稱** | `projectName` | 文字 (`@`) | |
| **項目名稱** | `itemName` | 文字 (`@`) | |
| **廠商編號** | `vendorId` | 文字 (`@`) | |
| **廠商名稱** | `vendorName` | 文字 (`@`) | |
| **預算金額** | `budgetAmount` | 數值 (`#,##0`) | |
| **終止金額** | `terminatedAmount` | 數值 (`#,##0`) | |
| **狀態** | `status` | 文字 (`@`) | |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **更新時間** | `updatedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |

#### 表單紀錄 (`表單紀錄`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **表單編號** | `formId` | 文字 (`@`) | |
| **表單類型** | `formType` | 文字 (`@`) | payment_request / seal_approval |
| **狀態** | `status` | 文字 (`@`) | |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **更新時間** | `updatedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **建立人** | `createdBy` | 文字 (`@`) | |
| **公司** | `company` | 文字 (`@`) | |
| **專案編號** | `projectId` | 文字 (`@`) | |
| **專案名稱** | `projectName` | 文字 (`@`) | |
| **廠商編號** | `vendorId` | 文字 (`@`) | |
| **廠商名稱** | `vendorName` | 文字 (`@`) | |
| **廠商統一編號** | `vendorTaxId` | 文字 (`@`) | |
| **預算類型** | `budgetType` | 文字 (`@`) | budgeted / unbudgeted |
| **預算項目編號** | `budgetItemId` | 文字 (`@`) | |
| **金額** | `amount` | 數值 (`#,##0`) | |
| **表單完整資料** | `payloadJson` | JSON / 長文字 | |
| **Excel檔案編號** | `excelFileId` | 文字 (`@`) | |
| **PDF檔案編號** | `pdfFileId` | 文字 (`@`) | |
| **版本** | `version` | 數值 (`#,##0`) | |

#### 請款紀錄 (`請款紀錄`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **請款編號** | `claimId` | 文字 (`@`) | 每筆請款唯一識別碼 |
| **表單編號** | `formId` | 文字 (`@`) | |
| **年度** | `year` | 文字 (`@`) | |
| **請款期別** | `claimPeriod` | 文字 (`@`) | |
| **請款期次** | `claimSequence` | 數值 (`#,##0`) | |
| **請款日期** | `claimDate` | 一般日期 (`yyyy/MM/dd`) | |
| **公司** | `company` | 文字 (`@`) | |
| **專案編號** | `projectId` | 文字 (`@`) | |
| **專案名稱** | `projectName` | 文字 (`@`) | |
| **廠商編號** | `vendorId` | 文字 (`@`) | |
| **廠商名稱** | `vendorName` | 文字 (`@`) | |
| **廠商統一編號** | `vendorTaxId` | 文字 (`@`) | |
| **預算類型** | `budgetType` | 文字 (`@`) | budgeted / unbudgeted |
| **預算項目編號** | `budgetItemId` | 文字 (`@`) | 有預算必填；無預算為空 |
| **項目名稱** | `itemName` | 文字 (`@`) | 無預算必填 |
| **預算外原因** | `unbudgetedReason` | 文字 (`@`) | 無預算可填 |
| **本期請款金額** | `currentClaimAmount` | 數值 (`#,##0`) | 原始請款 |
| **保留款** | `retentionAmount` | 數值 (`#,##0`) | |
| **預付款沖抵** | `advanceOffsetAmount` | 數值 (`#,##0`) | |
| **違約金／折讓** | `penaltyAmount` | 數值 (`#,##0`) | |
| **本期應付金額** | `payableAmount` | 數值 (`#,##0`) | 實際應付總額 |
| **狀態** | `status` | 文字 (`@`) | |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **更新時間** | `updatedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |

#### 付款紀錄 (`付款紀錄`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **付款編號** | `paymentId` | 文字 (`@`) | |
| **請款編號** | `claimId` | 文字 (`@`) | 關聯請款紀錄（支援一對多） |
| **表單編號** | `formId` | 文字 (`@`) | |
| **預算類型** | `budgetType` | 文字 (`@`) | |
| **預算項目編號** | `budgetItemId` | 文字 (`@`) | |
| **公司** | `company` | 文字 (`@`) | |
| **專案編號** | `projectId` | 文字 (`@`) | |
| **專案名稱** | `projectName` | 文字 (`@`) | |
| **廠商編號** | `vendorId` | 文字 (`@`) | |
| **廠商名稱** | `vendorName` | 文字 (`@`) | |
| **項目名稱** | `itemName` | 文字 (`@`) | |
| **付款金額** | `amount` | 數值 (`#,##0`) | |
| **付款狀態** | `status` | 文字 (`@`) | scheduled / paid / cancelled |
| **付款日期** | `paymentDate` | 一般日期 (`yyyy/MM/dd`) | |
| **年度** | `year` | 文字 (`@`) | |
| **月份** | `month` | 數值 (`#,##0`) | |
| **建立時間** | `createdAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **更新時間** | `updatedAt` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |

#### 異動紀錄 (`異動紀錄`)
| 中文欄位名稱 (Google Sheet Header) | 內部 Key (API / 程式變數) | 格式型態 | 備註 |
| :--- | :--- | :--- | :--- |
| **紀錄編號** | `logId` | 文字 (`@`) | |
| **時間** | `timestamp` | 日期時間 (`yyyy/MM/dd HH:mm:ss`) | |
| **使用者** | `user` | 文字 (`@`) | |
| **動作** | `action` | 文字 (`@`) | |
| **資料類型** | `entityType` | 文字 (`@`) | |
| **資料編號** | `entityId` | 文字 (`@`) | |
| **異動內容** | `detailJson` | JSON / 長文字 | |

---

## 既有已建立資料庫如何安全升級

若您在 Google Drive 中已經建立過舊版資料庫（第一列為英文 Header）：
1. 複製最新更新的 `Schema.gs`、`Utils.gs`、`DatabaseService.gs`、`YearService.gs` 到您的 Apps Script 專案。
2. 再次執行 **`initializeSystem`**。
3. 系統將會：
   - 自動檢測既有主檔資料庫與 2026 年度資料庫，**不產生任何重複檔案**。
   - 保留現有 Spreadsheet ID 與 Sheet ID。
   - 將第一列英文 Header 自動更新為中文 Header。
   - 將試算表語系調整為 `zh_TW`，時區調整為 `Asia/Taipei`。
   - 保留第 2 列以後的所有既有資料列，完全無痛升級！
