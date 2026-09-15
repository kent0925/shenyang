/**
 * api/session-login.ts - 獨立登入驗證 Endpoint
 *
 * 核心目的：
 * 1. 建立獨立 URL Path 邊界，配合 Vercel Firewall 實施 Per-IP Rate Limit（10次 / 10分鐘）。
 * 2. 僅接受 POST 方法，非 POST 回傳 405 METHOD_NOT_ALLOWED。
 * 3. 實施 Same-Origin 檢查，防範跨站登入攻擊 (CSRF)。
 * 4. 驗證 APP_ACCESS_PASSWORD，成功則簽發 HttpOnly shenyang_session Cookie。
 * 5. 錯誤時回傳安全中文訊息，絕不洩漏密碼雜湊、長度或環境變數名稱。
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  createSessionToken,
  verifyPassword,
  buildSessionCookie,
} from '../server/sessionAuth.ts';
import { checkOriginBoundary } from '../server/requestSecurity.ts';

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

  // 2. 來源檢查 (Same-Origin & CSRF 防護)
  const { isSameOrigin, isCrossSite, isLocalDev } = checkOriginBoundary(req);
  const isSecure = (req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production') && !isLocalDev;

  if (isCrossSite) {
    return res.status(403).json({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: '拒絕跨來源登入請求',
      },
    });
  }

  if (!isSameOrigin) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '僅允許同源瀏覽器進行登入',
      },
    });
  }

  // 3. 檢查伺服器環境配置
  const appPassword = process.env.APP_ACCESS_PASSWORD;
  const sessionSigningSecret = process.env.SESSION_SIGNING_SECRET;

  if (!appPassword || !sessionSigningSecret) {
    console.error('[SessionLogin] 伺服器缺少 APP_ACCESS_PASSWORD 或 SESSION_SIGNING_SECRET 配置');
    return res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_CONFIG_ERROR',
        message: '伺服器存取驗證尚未完成設定',
      },
    });
  }

  // 4. 解析輸入密碼並驗證
  const clientBody = req.body || {};
  const inputPassword = clientBody.password ? String(clientBody.password) : '';
  const isValid = verifyPassword(inputPassword, appPassword);

  if (!isValid) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '存取密碼不正確',
      },
    });
  }

  // 5. 簽發 Session Token 並寫入 HttpOnly Cookie
  const token = createSessionToken(sessionSigningSecret);
  res.setHeader('Set-Cookie', buildSessionCookie(token, isSecure));

  return res.status(200).json({
    ok: true,
    data: {
      authenticated: true,
    },
  });
}
