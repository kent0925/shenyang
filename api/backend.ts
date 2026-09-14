/**
 * api/backend.ts - Vercel Serverless Function Proxy
 * 
 * 角色：
 * 安全中繼瀏覽器/測試端至 Google Apps Script Web App。
 * 
 * 安全機制：
 * 1. 伺服器端自動注入 GAS_API_SHARED_SECRET，絕不對 Client 洩漏 GAS URL 與 Secret。
 * 2. 暫時安全門：檢查 Request Header "X-Internal-Api-Key" 必須等於 BACKEND_PROXY_TOKEN。
 * 3. 不使用萬用字元 CORS (*)。
 * 4. 錯誤映射與隱私保護：日誌中嚴禁輸出 Token、Secret 與銀行帳號。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// 若無 @vercel/node 型別定義時的通用介面支援
interface ExtendedRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}

interface ExtendedResponse {
  status: (code: number) => ExtendedResponse;
  json: (body: any) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export default async function handler(
  req: ExtendedRequest | VercelRequest,
  res: ExtendedResponse | VercelResponse
) {
  // 1. 僅允許 POST 方法
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: '僅支援 POST 請求方法',
      },
    });
  }

  // 2. 暫時安全門驗證：核對 X-Internal-Api-Key
  const configuredProxyToken = process.env.BACKEND_PROXY_TOKEN;
  const providedKey = req.headers['x-internal-api-key'] || req.headers['X-Internal-Api-Key'];

  if (!configuredProxyToken || configuredProxyToken.trim() === '' || providedKey !== configuredProxyToken) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '無效或缺失內部 API 存取憑證 (X-Internal-Api-Key)',
      },
    });
  }

  // 3. 檢查 GAS 環境變數配置
  const gasWebAppUrl = process.env.GAS_WEB_APP_URL;
  const gasSharedSecret = process.env.GAS_API_SHARED_SECRET;

  if (!gasWebAppUrl || !gasSharedSecret) {
    console.error('[Vercel Proxy] 缺少 GAS_WEB_APP_URL 或 GAS_API_SHARED_SECRET 環境變數');
    return res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_CONFIG_ERROR',
        message: '伺服器後端服務尚未配置連線資訊',
      },
    });
  }

  // 4. 解析 Client 傳入的 Action 與 Payload
  const clientBody = req.body || {};
  const action = clientBody.action;
  const payload = clientBody.payload || {};

  if (!action || typeof action !== 'string') {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '缺少必要的請求動作 (action)',
      },
    });
  }

  // 5. 組裝含 Secret 之請求轉發至 GAS Web App
  const gasRequestBody = {
    secret: gasSharedSecret,
    action: action,
    payload: payload,
  };

  try {
    const gasResponse = await fetch(gasWebAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gasRequestBody),
    });

    if (!gasResponse.ok) {
      console.error(`[Vercel Proxy] GAS Web App HTTP 連線異常 (HTTP ${gasResponse.status})`);
      return res.status(502).json({
        ok: false,
        error: {
          code: 'UPSTREAM_HTTP_ERROR',
          message: 'GAS 後端服務連線回應異常',
        },
      });
    }

    let gasData: any;
    try {
      gasData = await gasResponse.json();
    } catch (parseErr) {
      console.error('[Vercel Proxy] 無法解析 GAS 回傳之 JSON 資料');
      return res.status(502).json({
        ok: false,
        error: {
          code: 'UPSTREAM_PARSE_ERROR',
          message: '無法解析 GAS 後端回應資料格式',
        },
      });
    }

    // 6. 依據 GAS 回傳結果映射 HTTP 狀態碼
    if (gasData.ok === true) {
      return res.status(200).json(gasData);
    } else {
      const errCode = gasData.error?.code || 'UPSTREAM_ERROR';
      let httpStatus = 502;

      switch (errCode) {
        case 'UNAUTHORIZED':
          httpStatus = 401;
          break;
        case 'VALIDATION_ERROR':
        case 'UNKNOWN_ACTION':
        case 'INVALID_JSON':
          httpStatus = 400;
          break;
        case 'NOT_FOUND':
          httpStatus = 404;
          break;
        default:
          httpStatus = 502;
          break;
      }

      return res.status(httpStatus).json(gasData);
    }
  } catch (netErr: any) {
    console.error('[Vercel Proxy] 轉發連線發生網路例外: ' + (netErr.message || 'unknown'));
    return res.status(500).json({
      ok: false,
      error: {
        code: 'PROXY_NETWORK_ERROR',
        message: '連線至後端服務時發生網路異常',
      },
    });
  }
}
