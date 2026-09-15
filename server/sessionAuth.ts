/**
 * server/sessionAuth.ts - 伺服器端 Session 簽章與驗證模組
 *
 * 核心規範：
 * 1. 僅於 Node.js / Vercel Serverless 環境運行，嚴禁被前端 Browser Bundle 引用。
 * 2. 使用 node:crypto 原生函式庫（HMAC-SHA256, timingSafeEqual, randomBytes）。
 * 3. 實作 stateless server-signed session token (格式: base64url(payload).base64url(signature))。
 * 4. 密碼驗證採用 SHA-256 哈希後進行固定時間比較 (timingSafeEqual)，杜絕 timing attack。
 * 5. Cookie 規範：名稱 shenyang_session，具備 HttpOnly、SameSite=Strict、Path=/、Max-Age=28800。
 */

import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'shenyang_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 小時 (28800 秒)

export interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
}

/**
 * 產生 Server-Signed Session Token
 * @param secret 伺服器端 SESSION_SIGNING_SECRET
 * @return 格式為 base64url(payload).base64url(signature) 之字串
 */
export function createSessionToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * 驗證 Server-Signed Session Token
 * @param token 待驗證之 session token
 * @param secret 伺服器端 SESSION_SIGNING_SECRET
 * @return 驗證成功回傳 SessionPayload，若無效或過期回傳 null
 */
export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, providedSignature] = parts;
  if (!payloadBase64 || !providedSignature) {
    return null;
  }

  // 1. 計算預期簽章並使用固定時間比較 (timingSafeEqual)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  const providedBuf = Buffer.from(providedSignature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  // 2. 解析 Payload 內容
  let payload: SessionPayload;
  try {
    const rawJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    payload = JSON.parse(rawJson);
  } catch {
    return null;
  }

  // 3. 驗證 Payload 欄位與時效
  if (!payload || payload.v !== 1 || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now || payload.iat > now + 60) {
    return null; // 已過期或發行時間不合理
  }

  return payload;
}

/**
 * 安全比對使用者輸入密碼與設定密碼 (防範長度差異與 Timing Attack)
 * @param inputPassword 使用者輸入之密碼
 * @param configuredPassword 伺服器環境變數設定之密碼
 */
export function verifyPassword(inputPassword: string, configuredPassword: string): boolean {
  if (typeof inputPassword !== 'string' || typeof configuredPassword !== 'string') {
    return false;
  }

  if (inputPassword.length === 0 || configuredPassword.length === 0) {
    return false;
  }

  const inputHash = crypto.createHash('sha256').update(inputPassword, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(configuredPassword, 'utf8').digest();

  return crypto.timingSafeEqual(inputHash, expectedHash);
}

/**
 * 解析 HTTP Request 內之 Cookie Header
 */
export function parseCookies(cookieHeader?: string | string[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  const headerStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  const pairs = headerStr.split(';');

  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key) {
        result[key] = decodeURIComponent(val);
      }
    }
  }

  return result;
}

/**
 * 建置登入成功之 Set-Cookie 字串
 */
export function buildSessionCookie(token: string, isSecure: boolean): string {
  const flags = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (isSecure) {
    flags.push('Secure');
  }

  return flags.join('; ');
}

/**
 * 建置登出清除之 Set-Cookie 字串
 */
export function buildClearSessionCookie(isSecure: boolean): string {
  const flags = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  if (isSecure) {
    flags.push('Secure');
  }

  return flags.join('; ');
}
