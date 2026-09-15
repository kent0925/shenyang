# 公司表單產生器 (Shenyang Form Generator)

本專案採「**前端本機文件產生 + 最小化無狀態 Vercel Serverless 統編查詢 Proxy，無資料庫、無表單資料持久化**」架構，提供用印簽呈與請款單之文件產生工具，可直接部署至 Vercel。

---

## 核心特色與隱私資安保證

- **隱私與資料安全保證**：
  只有使用者主動使用統編查詢時，8 碼統編會送至 Vercel 查詢 Proxy 並轉送政府公開商工資料服務。廠商名稱、戶名、銀行帳號、金額、請款內容及 Excel/PDF 不會被 Proxy 儲存或傳送。
- **請款單功能增強**：
  - **統一編號 (vendorTaxId)**：依財政部 112 年擴增統編正式規則實作檢核演算法（除數為 5，並相容舊制與第 7 位特例）。
  - **統編查公司名稱**：透過 `/api/company` Proxy 轉送經濟部商工登記公開 API 即時查詢帶入受款人名稱，並可手動自由修改。
  - **銀行資料區雙向連動**：精煉金管會官方金融機構與分行資料庫，支援銀行代碼／名稱與分行代碼／名稱雙向即時搜尋與連動過濾。
  - **戶名同步與手動模式**：預設勾選同廠商名稱唯讀同步，取消勾選可自由編輯戶名且後續不受廠商變更影響，重新勾選以廠商名稱覆蓋恢復同步。
  - **帳號保證**：保留前導 0 之字串型態，絕無科學記號變形。
- **100% 保留 XLSM 巨集與 VBA**：
  - 嚴格採用 `jszip` 針對 OpenXML 進行局部儲存格更新，**絕不重建 Workbook**。
  - 完整保留 `xl/vbaProject.bin`（SHA-256 雜湊 `efff5dbda2382b354c780f396ac76bace5f64ecf3a59211365f562938767f913` 完全吻合）、隱藏工作表（工具頁、執行頁）、照相機投影控制項與列印範圍。
- **保護既有公式**：
  - 請款單之實付金額公式（如 `=H13-I13-L13-N13`）與累計公式全面防覆寫保護。
- **母版淨化與舊資料全區清除機制**：
  - 每次產生檔案時，說明欄位全區（用印 B7:B23、請款 G22:G37）先行清空再寫入，杜絕舊案文字殘留。
- **A4 擬真單頁 PDF 輸出**：繁體中文顯示清晰無亂碼，高度尺寸緊湊約束，嚴格保證單頁（Page count = 1）不跨頁。
- **規範檔名產生**：自動過濾 Windows 非法字元（`\ / : * ? " < > |`），無專案時自動略過底線。

---

## 支援表單與欄位規格

### 1. 用印／簽呈
- **母版**：`public/templates/用印及簽核表單-含小家.xlsm`
- **主要欄位**：
  - 公司名稱（`B1`）
  - 申請日期（`I5`，互動式 Date Picker 點選）
  - 主旨（`C5`）
  - 說明（`B7:B23`，上限 17 列；超出時 UI 顯示警示）
  - 類型（簽呈、用印、借印，可複選；連動更新工具頁 `A1:A3` 相機投影狀態）
- **檔名規則**：`{主旨}_{YYYYMMDD}_{類型}.xlsm` 及 `.pdf`

### 2. 請款單
- **母版**：`public/templates/請款單.xlsx`
- **主要欄位**：
  - 公司名稱（`H1`）
  - 申請日（`V3`, `Y3`, `AB3`，自動換算民國年月日）
  - 專案代號／名稱（`E5`，選填）
  - 請購單編號（`I5`）
  - 受款人／廠商（`N5`）
  - 費用歸屬部門（`E7`）
  - 合約／訂購單編號（`I7`）
  - 匯款帳號（`N7`，結構化輸入銀行代碼/全名、分行、戶名、帳號）
  - 費用性質（`E10`）
  - 合約／訂購單總額（`I10`）
  - 付款到期日（`N10`, `Q10`, `T10`，自動換算民國年月日）
  - 本期款項明細：請款額 (`H13`)、保留款 (`I13`)、預付款沖銷 (`L13`)、罰扣折讓 (`N13`)
  - 實付金額：維持原生公式 `=H13-I13-L13-N13` (`T13`)
  - 特殊要求：6 項表單控制項核取方塊與遠期支票兌現日
  - 請款說明（`G22:G37`，上限 16 列；超出時 UI 顯示警示）
- **檔名規則**：
  - 有專案：`{專案}_{廠商}_{YYYYMMDD}.xlsx` 及 `.pdf`
  - 無專案：`{廠商}_{YYYYMMDD}.xlsx` 及 `.pdf`（直接略過專案，不留多餘底線）

---

## 系統架構

```text
├── api/                # Vercel Serverless Function Proxy (最小化無狀態統編查詢)
│   └── company.ts
public/
├── data/               # 官方金融機構分行快取資料庫
│   └── banks.json
└── templates/          # 原始乾淨母版
    ├── 用印及簽核表單-含小家.xlsm
    └── 請款單.xlsx
src/
├── models/             # 統一 TypeScript 資料結構
│   ├── sealApproval.ts
│   └── paymentRequest.ts
├── generators/         # 產生器（與 UI 完全解耦）
│   ├── excel/          # OOXML 局部修補器
│   └── pdf/            # HTML2PDF 高擬真渲染器
├── services/           # 商工與銀行查詢服務
│   ├── bankLookup.ts   # 金管會金融機構與分行雙向連動查詢
│   ├── companyLookup.ts# 財政部擴增統編檢核與商工 API 查詢
│   └── storage.ts      # 儲存介面抽象
├── utils/              # 檔名清洗、日期與貨幣格式化工具
└── components/         # 響應式 UI 元件
```

---

## 本地開發與建置

```bash
# 安裝依賴
npm install

# 啟動本地開發伺服器
npm run dev

# 執行型別檢查
npm run typecheck

# 執行生產環境打包
npm run build
```

---

## 部署至 Vercel

本專案為標準 Vite 前端專案，可直接匯入 Vercel：
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

---

## 伺服器環境變數設定 (Vercel Serverless)

本專案後端 Proxy (`/api/backend`) 與授權邊界需要以下 **Server-Only** 環境變數：

```text
# GAS 後端轉發憑證 (Server-Only)
GAS_WEB_APP_URL=<server-only-gas-url>
GAS_API_SHARED_SECRET=<server-only-shared-secret>

# 內部自動化／測試金鑰 (Server-Only)
BACKEND_PROXY_TOKEN=<server-only-internal-token>

# 前端共享解鎖密碼 (Server-Only，內部使用者進入系統時輸入)
APP_ACCESS_PASSWORD=<server-only-secret>

# Session Token 簽署密鑰 (Server-Only，HMAC-SHA256 簽名用)
SESSION_SIGNING_SECRET=<server-only-random-secret>
```

> **資安重要規範**：
> - 以上變數均為 **Server-Side 專用**，**嚴禁使用 `VITE_` 前綴**。
> - 任何金鑰、Token 與密碼均不可暴露至前端 Browser Bundle 或進入任何客戶端程式碼中。
