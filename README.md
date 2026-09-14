# 公司表單產生器 (Shenyang Form Generator)

這是一個純前端、無伺服器、無資料庫、零外部資料傳輸的公司表單產生器網頁工具，可直接部署至 Vercel。

---

## 核心特色與保證

- **零資料上傳 (Zero Network Data Submission)**：所有資料皆在使用者瀏覽器記憶體中運算，絕不上傳至任何伺服器或第三方 API，重整或關閉分頁後資料立即清除。
- **100% 保留 XLSM 巨集與 VBA**：
  - 嚴格採用 `jszip` 針對 OpenXML 進行局部儲存格更新，**絕不重建 Workbook**。
  - 完整保留 `xl/vbaProject.bin`（SHA-256 雜湊完全吻合）、隱藏工作表（工具頁、執行頁）、照相機投影控制項與列印範圍。
- **保護既有公式**：
  - 請款單之實付金額公式（如 `=H13-I13-L13-N13`）與累計公式全面防覆寫保護。
- **母版淨化與舊資料全區清除機制**：
  - 每次產生檔案時，說明欄位全區（用印 B7:B23、請款 G22:G37）先行清空再寫入，杜絕舊案文字殘留。
- **A4 擬真 PDF 輸出**：繁體中文顯示清晰無亂碼，支援長文字自動換行與跨頁。
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

## 系統架構與 Phase 2 擴充規劃

```text
src/
├── models/             # 統一 TypeScript 資料結構
│   ├── sealApproval.ts
│   └── paymentRequest.ts
├── generators/         # 產生器（與 UI 完全解耦）
│   ├── excel/          # OOXML 局部修補器
│   └── pdf/            # HTML2PDF 高擬真渲染器
├── services/           # 儲存服務介面抽象
│   └── storage.ts      # Phase 1 為 no-op；Phase 2 可無痛接入 GAS Web App API
├── utils/              # 檔名清洗、日期與貨幣格式化工具
└── components/         # 響應式 UI 元件
```

未來若需升級 Phase 2（串接 GAS / Google Sheets / Google Drive），只需替換 `src/services/storage.ts` 實作，現有表單 UI 與 Excel/PDF 產生器完全不需重寫。

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
