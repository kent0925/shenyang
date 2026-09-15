/**
 * api/backend.ts - Vercel Serverless Function Proxy
 * 
 * 角色：
 * 安全中繼瀏覽器/測試端至 Google Apps Script Web App。
 * 
 * 安全機制：
 * 1. 伺服器端自動注入 GAS_API_SHARED_SECRET，絕不對 Client 洩漏 GAS URL 與 Secret。
 * 2. 安全存取邊界：僅接受同源 (Same-Origin) 瀏覽器請求或正確帶有 X-Internal-Api-Key 之內部測試請求。
 * 3. 嚴禁使用萬用字元 CORS (*)。
 * 4. 錯誤映射與隱私保護：日誌中嚴禁輸出 Token、Secret 與銀行帳號。
 */

import type { IncomingMessage, ServerResponse } from 'http';

export interface VercelApiRequest extends IncomingMessage {
  body?: any;
  query?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
}

export interface VercelApiResponse extends ServerResponse {
  status: (statusCode: number) => VercelApiResponse;
  json: (jsonBody: any) => void;
  send: (body: any) => void;
}

/**
 * 檢查請求是否來自同源 (Same-Origin) 前端環境
 *
 * 原則：
 * 1. 現代瀏覽器自動帶入且禁止 JS 偽造的 Sec-Fetch-Site 優先檢查。
 * 2. 比對 Host (含 x-forwarded-host) 與 Origin / Referer。
 * 3. 支援本地開發 (localhost / 127.0.0.1) 同源相容。
 * 4. 嚴禁 Access-Control-Allow-Origin: *，絕不允許跨站請求。
 */
function checkSameOriginRequest(req: VercelApiRequest): boolean {
  const secFetchSiteHeader = req.headers['sec-fetch-site'];
  const secFetchSite = Array.isArray(secFetchSiteHeader) ? secFetchSiteHeader[0] : secFetchSiteHeader;

  // 跨站請求明確拒絕
  if (secFetchSite && secFetchSite === 'cross-site') {
    return false;
  }

  const rawHost = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  const hostVal = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  const requestHost = hostVal.split(':')[0].toLowerCase();

  if (!requestHost) {
    return false;
  }

  const rawOrigin = req.headers['origin'];
  const originVal = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

  const rawReferer = req.headers['referer'];
  const refererVal = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;

  let clientHost = '';
  if (originVal) {
    try {
      clientHost = new URL(originVal).hostname.toLowerCase();
    } catch {
      return false;
    }
  } else if (refererVal) {
    try {
      clientHost = new URL(refererVal).hostname.toLowerCase();
    } catch {
      return false;
    }
  }

  // 檢查 Origin / Referer 主機是否與 Request 主機一致
  if (clientHost && clientHost === requestHost) {
    return true;
  }

  // 本地開發環境相容 (例如 localhost / 127.0.0.1)
  const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1';
  if (clientHost && isLocal(clientHost) && isLocal(requestHost)) {
    return true;
  }

  return false;
}

export default async function handler(
  req: VercelApiRequest,
  res: VercelApiResponse
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

  // 2. 安全存取邊界驗證：
  // 允許「持有內部金鑰之請求 (X-Internal-Api-Key)」或「瀏覽器同源請求 (Same-Origin Request)」
  const configuredProxyToken = process.env.BACKEND_PROXY_TOKEN;
  const headerKey = req.headers['x-internal-api-key'] || req.headers['X-Internal-Api-Key'];
  const providedKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;

  const hasValidInternalKey = Boolean(
    configuredProxyToken &&
    configuredProxyToken.trim() !== '' &&
    providedKey === configuredProxyToken
  );

  const isSameOrigin = checkSameOriginRequest(req);

  if (!hasValidInternalKey && !isSameOrigin) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '未授權的存取請求：缺失內部 API 憑證且非同源請求',
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
