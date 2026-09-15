/**
 * server/requestSecurity.ts - 伺服器端請求來源與 CSRF 檢查模組
 *
 * 核心規範：
 * 1. 僅限 Server-side 內部引用，非公開 API route。
 * 2. 嚴禁萬用字元 CORS (*)。
 * 3. 檢查 Sec-Fetch-Site、Host (含 x-forwarded-host) 與 Origin / Referer。
 * 4. 支援本地開發 (localhost / 127.0.0.1) 相容。
 */

import type { IncomingMessage } from 'http';

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
