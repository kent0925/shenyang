# Phase 2B-1C: 登入暴力猜測防護與 Vercel Firewall 規格

## 一、概述

為防止公開網路上惡意自動化工具對系統共享存取密碼進行大量猜測攻擊，系統於 Phase 2B-1C 建立獨立登入端點：

```text
POST /api/session-login
```

並將舊有 `POST /api/backend (action: sessionLogin)` 入口徹底停用，消除任何可繞過防火牆邊界的後門路徑。

---

## 二、Vercel Firewall 規則規格 (Production Release Prerequisite)

在未來的 Production 部署階段，需於 Vercel 專案設定或透過 Vercel CLI 套用以下 Firewall 自訂限流規則：

| 規格欄位 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **Rule Name** | `shenyang-session-login-rate-limit` | 防火牆規則名稱 |
| **Target Path** | `/api/session-login` | 獨立登入端點 URL Path |
| **HTTP Method** | `POST` | 僅針對登入請求 |
| **Rate Limit Key** | `IP` (Client IP) | 以來源 IP 為計數單位 |
| **Request Limit** | `10 requests` | 限制最大請求次數為 10 次 |
| **Time Window** | `600 seconds` (10 分鐘) | 固定視窗時間區間 |
| **Algorithm** | `fixed_window` | 固定視窗演算法 |
| **Action on Exceeded** | `Rate Limit (HTTP 429)` | 超額時直接由邊緣防火牆阻斷 |

---

## 三、為什麼是 10 次 / 10 分鐘 / IP？

1. **內部共享密碼模式**：系統為內部受控作業環境，合法使用者在正常作業下，10 分鐘內無需且不應頻繁登入超過 10 次。
2. **NAT / 企業固定 IP 相容性**：考慮公司辦公室內部多位同仁共用同一外部 NAT IP 出口，10 次 / 10 分鐘能確保合法併發使用不受阻礙，同時徹底遏止每秒數十次至數百次的字典猜測攻擊。
3. **針對請求次數而非僅限密碼錯誤**：由 Edge Firewall 直接在邊界計數，防範攻擊者透過不同回應行為或特殊 Payload 探測系統。

---

## 四、Vercel CLI 狀態與發布指引

1. **本地 CLI 檢驗狀態**：
   - 檢驗結果：`Vercel CLI unavailable; command not guessed.`（本地開發環境未安裝全域 `vercel` 指令）。
2. **規則發布時機**：
   - 本階段狀態為：`CONFIG PREPARED / NOT YET PUBLISHED`。
   - 依專案規範，**嚴禁在未正式發布前修改 Production Firewall**。
   - 本設定作為後續 **Production Release Prerequisite**，待正式 Promote / Deploy 流程時於 Vercel 控制台或透過授權之 CLI 啟用並驗證。
