/**
 * api/backend.ts - Vercel Serverless Function Proxy & Request Boundary
 *
 * 核心授權模型：
 * Valid Internal API Key (X-Internal-Api-Key)
 * OR
 * Valid Same-Origin Browser Request
 *
 * 重要安全定位聲明：
 * 1. Same-Origin 僅為暫時性來源防護邊界 (Request Boundary)，絕非使用者身分驗證 (Authentication)。
 * 2. 本版本在正式 LINE Login / LIFF 完成前，不得公開作為 Production authenticated business system。
 * 3. 伺服器端自動注入 GAS_API_SHARED_SECRET，絕不對 Client 洩漏 GAS URL 與 Secret。
 * 4. 嚴禁使用萬用字元 CORS (*)。
 */

import type { IncomingMessage, ServerResponse } from 'http';

export interface OriginCheckResult {
  isSameOrigin: boolean;
  isCrossSite: boolean;
  isLocalDev: boolean;
}

/**
 * 檢查請求是否來自同源 (Same-Origin) 前端環境與 CSRF 狀態
 */
export function checkOriginBoundary(req: IncomingMessage): OriginCheckResult {
  const secFetchSiteHeader = req.headers['sec-fetch-site'];
  const secFetchSite = Array.isArray(secFetchSiteHeader) ? secFetchSiteHeader[0] : secFetchSiteHeader;

  // 現代瀏覽器若明確標記 cross-site 則判定為跨站
  const isCrossSite = secFetchSite === 'cross-site';

  const rawHost = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  const hostVal = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  const requestHost = hostVal.split(':')[0].toLowerCase();

  if (!requestHost) {
    return { isSameOrigin: false, isCrossSite: true, isLocalDev: false };
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
      return { isSameOrigin: false, isCrossSite: true, isLocalDev: false };
    }
  } else if (refererVal) {
    try {
      clientHost = new URL(refererVal).hostname.toLowerCase();
    } catch {
      return { isSameOrigin: false, isCrossSite: true, isLocalDev: false };
    }
  }

  const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1';
  const isLocalDev = isLocalHost(requestHost) || isLocalHost(clientHost);

  // 跨站請求拒絕
  if (isCrossSite) {
    return { isSameOrigin: false, isCrossSite: true, isLocalDev };
  }

  // 檢查 Origin / Referer 主機是否與 Request 主機一致
  if (clientHost && clientHost === requestHost) {
    return { isSameOrigin: true, isCrossSite: false, isLocalDev };
  }

  // 本地開發環境相容 (例如 localhost:5173 呼叫 localhost:3000)
  if (clientHost && isLocalHost(clientHost) && isLocalHost(requestHost)) {
    return { isSameOrigin: true, isCrossSite: false, isLocalDev: true };
  }

  // 若完全無 Origin 與 Referer
  return { isSameOrigin: false, isCrossSite: false, isLocalDev };
}

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

  // 2. 解析 Client 傳入的 Action 與 Payload
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

  // 3. 安全防護：已取消之 Session Actions 一律以 UNKNOWN_ACTION 拒絕
  if (action === 'sessionLogin' || action === 'sessionStatus' || action === 'sessionLogout') {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'UNKNOWN_ACTION',
        message: '未知的請求動作 (action)',
      },
    });
  }

  // 4. 檢查來源邊界 (Same-Origin 與 Cross-Site)
  const { isSameOrigin, isCrossSite } = checkOriginBoundary(req);

  // 5. 授權模型驗證：Valid Internal Key OR Same-Origin Browser Request
  const configuredProxyToken = process.env.BACKEND_PROXY_TOKEN;
  const headerKey = req.headers['x-internal-api-key'] || req.headers['X-Internal-Api-Key'];
  const providedKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;

  const hasValidInternalKey = Boolean(
    configuredProxyToken &&
    configuredProxyToken.trim() !== '' &&
    providedKey === configuredProxyToken
  );

  let isAuthorized = false;

  if (hasValidInternalKey) {
    // 內部自動化／CI／測試金鑰放行
    isAuthorized = true;
  } else {
    // 瀏覽器存取邊界防護：嚴禁跨站請求 (CSRF 防護)
    if (isCrossSite) {
      return res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: '拒絕跨來源存取請求',
        },
      });
    }

    // 非同源且無內部金鑰者一律拒絕
    if (!isSameOrigin) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '未授權的存取請求：非同源請求且無有效內部憑證',
        },
      });
    }

    // 允許同源瀏覽器請求通過邊界
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '未授權的 API 存取請求',
      },
    });
  }

  // Attachment chunks remain below the serverless request/response limit after base64.
  // All other attachment requests contain metadata only, never a full binary.
  if (/^(beginFormAttachmentUpload|uploadFormAttachmentChunk|finalizeFormAttachmentFile|finalizeFormAttachment|listFormAttachments|getFormAttachmentFileInfo|getFormAttachmentFileChunk)$/.test(action)) {
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const limit = action === 'uploadFormAttachmentChunk' ? Math.ceil(2 * 1024 * 1024 / 3) * 4 + 4096 : 64 * 1024;
    if (size > limit) {
      return res.status(413).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: '附件請求過大，請使用分塊上傳。' } });
    }
  }

  // ----------------------------------------------------
  // 7. 轉發至 GAS Web App
  // ----------------------------------------------------

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
