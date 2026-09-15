/**
 * scripts/test_phase2b_auth.mjs - Phase 2B-1B / 2B-1C 授權邊界與登入防護自動化驗證腳本
 *
 * 驗證目標：
 * 1. 驗證 Phase 2B-1B 新增的 Server-Signed Session 授權邊界、Cookie 安全設定、Same-Origin CSRF 防護。
 * 2. 驗證 Phase 2B-1C 將登入移至獨立 /api/session-login 邊界後，不存在可繞過 Firewall 的舊路徑。
 * 3. 驗證前端能安全處理 HTTP 429 Rate Limit。
 * 4. 純 Node.js 原生執行，不新增任何第三方測試套件依賴。
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import backendHandler from '../api/backend.ts';
import sessionLoginHandler from '../api/session-login.ts';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  parseCookies,
  buildSessionCookie,
  buildClearSessionCookie,
} from '../server/sessionAuth.ts';
import { checkOriginBoundary } from '../server/requestSecurity.ts';
import { requestJson, BackendApiError } from '../src/services/backendClient.ts';

// 測試用假環境變數
const TEST_ENV = {
  APP_ACCESS_PASSWORD: 'test-correct-password-123',
  SESSION_SIGNING_SECRET: 'test-signing-secret-very-secure-8888',
  BACKEND_PROXY_TOKEN: 'test-backend-proxy-token-phase2a',
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/mock/exec',
  GAS_API_SHARED_SECRET: 'test-gas-shared-secret',
};

// 設定測試環境
Object.assign(process.env, TEST_ENV);

// 模擬 Mock Response 物件
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// 模擬 Mock Request 物件
function createMockReq(options = {}) {
  const {
    method = 'POST',
    action,
    payload = {},
    body,
    headers = {},
    cookies = {},
  } = options;

  const defaultHeaders = {
    'host': 'shenyang.example.com',
    'x-forwarded-proto': 'https',
    ...headers,
  };

  if (Object.keys(cookies).length > 0 && !defaultHeaders['cookie']) {
    defaultHeaders['cookie'] = Object.entries(cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');
  }

  const resolvedBody = body !== undefined ? body : (action !== undefined ? { action, payload } : payload);

  return {
    method,
    headers: defaultHeaders,
    body: resolvedBody,
  };
}

async function runTests() {
  console.log('=== 開始執行 Phase 2B 授權邊界與登入防護安全驗證 ===\n');
  let passCount = 0;

  // Case 1: 沒有 internal key、沒有 session -> 正常 backend action → 401
  {
    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Case 1: 應回傳 401');
    assert.strictEqual(res.body?.ok, false);
    assert.strictEqual(res.body?.error?.code, 'UNAUTHORIZED');
    console.log('PASS: Case 1 - 沒有 internal key、沒有 session -> 正常 backend action 遭 401 拒絕');
    passCount++;
  }

  // Case 2: 錯誤 internal key、沒有 session -> 401
  {
    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'x-internal-api-key': 'wrong-token',
        'origin': 'https://shenyang.example.com',
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Case 2: 應回傳 401');
    assert.strictEqual(res.body?.error?.code, 'UNAUTHORIZED');
    console.log('PASS: Case 2 - 錯誤 internal key、沒有 session -> 遭 401 拒絕');
    passCount++;
  }

  // Case 3: 正確 internal key -> 可通過授權邊界 (保持 automation compatibility)
  {
    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'x-internal-api-key': TEST_ENV.BACKEND_PROXY_TOKEN,
      },
    });
    const res = createMockRes();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: [{ projectId: 'PRJ-2026-000001' }] }),
    });

    try {
      await backendHandler(req, res);
      assert.strictEqual(res.statusCode, 200, 'Case 3: 應回傳 200');
      assert.strictEqual(res.body?.ok, true);
      assert.deepStrictEqual(res.body?.data, [{ projectId: 'PRJ-2026-000001' }]);
      console.log('PASS: Case 3 - 正確 internal key -> 順利通過驗證並轉發 (Automation 相容)');
      passCount++;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // 產生一組有效 Session 供後續驗證使用
  const validSessionCookieValue = createSessionToken(TEST_ENV.SESSION_SIGNING_SECRET);

  // Case 4: 正確密碼登入 (新端點 POST /api/session-login) -> 200 且簽發完整安全的 HttpOnly Cookie
  {
    const req = createMockReq({
      body: { password: TEST_ENV.APP_ACCESS_PASSWORD },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-proto': 'https',
      },
    });
    const res = createMockRes();
    await sessionLoginHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 4: 登入應回傳 200');
    assert.strictEqual(res.body?.ok, true);
    assert.strictEqual(res.body?.data?.authenticated, true);

    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie, 'Case 4: 必須有 Set-Cookie header');
    assert.ok(setCookie.includes('shenyang_session='), 'Case 4: Cookie 需為 shenyang_session');
    assert.ok(setCookie.includes('HttpOnly'), 'Case 4: 必須包含 HttpOnly');
    assert.ok(setCookie.includes('SameSite=Strict'), 'Case 4: 必須包含 SameSite=Strict');
    assert.ok(setCookie.includes('Path=/'), 'Case 4: 必須包含 Path=/');
    assert.ok(setCookie.includes('Secure'), 'Case 4: HTTPS 環境必須包含 Secure');
    assert.ok(setCookie.includes('Max-Age=28800'), 'Case 4: 必須包含 8 小時 Max-Age');
    console.log('PASS: Case 4 - 正確密碼登入 -> 回傳 200 且簽發完整安全的 HttpOnly Cookie');
    passCount++;
  }

  // Case 5: 錯誤密碼登入 (新端點 POST /api/session-login) -> 401 拒絕且不發放 Cookie
  {
    const req = createMockReq({
      body: { password: 'wrong-password' },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await sessionLoginHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Case 5: 錯誤密碼應回傳 401');
    assert.strictEqual(res.body?.ok, false);
    assert.strictEqual(res.body?.error?.message, '存取密碼不正確');
    assert.strictEqual(res.headers['set-cookie'], undefined, 'Case 5: 嚴禁 Set-Cookie');
    console.log('PASS: Case 5 - 錯誤密碼登入 -> 401 拒絕且不發放 Cookie');
    passCount++;
  }

  // Case 6: sessionStatus 無 cookie -> authenticated=false
  {
    const req = createMockReq({
      action: 'sessionStatus',
      payload: {},
      headers: {
        'origin': 'https://shenyang.example.com',
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 6: 應回傳 200');
    assert.strictEqual(res.body?.ok, true);
    assert.strictEqual(res.body?.data?.authenticated, false);
    console.log('PASS: Case 6 - sessionStatus 無 cookie -> authenticated=false');
    passCount++;
  }

  // Case 7: 有效 session -> sessionStatus → authenticated=true
  {
    const req = createMockReq({
      action: 'sessionStatus',
      payload: {},
      headers: {
        'origin': 'https://shenyang.example.com',
      },
      cookies: {
        shenyang_session: validSessionCookieValue,
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 7: 應回傳 200');
    assert.strictEqual(res.body?.ok, true);
    assert.strictEqual(res.body?.data?.authenticated, true);
    console.log('PASS: Case 7 - 有效 session -> sessionStatus 回傳 authenticated=true');
    passCount++;
  }

  // Case 8: tampered session token -> 驗證失敗 / 401
  {
    const tamperedToken = validSessionCookieValue + 'malicious';
    const req = createMockReq({
      action: 'sessionStatus',
      payload: {},
      headers: {
        'origin': 'https://shenyang.example.com',
      },
      cookies: {
        shenyang_session: tamperedToken,
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.body?.data?.authenticated, false, 'Case 8: 竄改 token 狀態應為 false');

    // 測試用竄改 token 存取正常業務 API
    const req2 = createMockReq({
      action: 'listProjects',
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
      cookies: {
        shenyang_session: tamperedToken,
      },
    });
    const res2 = createMockRes();
    await backendHandler(req2, res2);
    assert.strictEqual(res2.statusCode, 401, 'Case 8: 竄改 token 存取 API 應回傳 401');
    console.log('PASS: Case 8 - 遭竄改之 session token 經 constant-time 比對判定無效');
    passCount++;
  }

  // Case 9: expired session -> 401
  {
    const expiredPayload = {
      v: 1,
      iat: Math.floor(Date.now() / 1000) - 30000,
      exp: Math.floor(Date.now() / 1000) - 100,
      nonce: 'expired-nonce',
    };
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const sig = crypto.createHmac('sha256', TEST_ENV.SESSION_SIGNING_SECRET).update(payloadB64).digest('base64url');
    const expiredToken = `${payloadB64}.${sig}`;

    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
      cookies: {
        shenyang_session: expiredToken,
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Case 9: 過期 token 應回傳 401');
    console.log('PASS: Case 9 - 過期 session token 拒絕放行');
    passCount++;
  }

  // Case 10: 有效 session + same-origin -> normal backend action 可繼續 proxy
  {
    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
      cookies: {
        shenyang_session: validSessionCookieValue,
      },
    });
    const res = createMockRes();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: [{ projectId: 'PRJ-2026-000001' }] }),
    });

    try {
      await backendHandler(req, res);
      assert.strictEqual(res.statusCode, 200, 'Case 10: 應回傳 200');
      assert.strictEqual(res.body?.ok, true);
      console.log('PASS: Case 10 - 有效 session + same-origin -> 正常轉發業務 API');
      passCount++;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Case 11: 有效 session + cross-origin -> 403
  {
    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'origin': 'https://attacker.evil.com',
        'sec-fetch-site': 'cross-site',
      },
      cookies: {
        shenyang_session: validSessionCookieValue,
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 403, 'Case 11: 跨站請求即使有 session 亦應回傳 403');
    assert.strictEqual(res.body?.error?.code, 'FORBIDDEN');
    console.log('PASS: Case 11 - 跨站請求 (Cross-Origin) 遭 403 FORBIDDEN 阻斷 (CSRF 防護生效)');
    passCount++;
  }

  // Case 12: Same-Origin 但沒有 session -> 401 (重要：Same-Origin ≠ Authentication)
  {
    const req = createMockReq({
      action: 'listProjects',
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Case 12: 缺少 session 必須回傳 401');
    assert.strictEqual(res.body?.error?.code, 'UNAUTHORIZED');
    console.log('PASS: Case 12 - 同源請求但缺少 Session 遭 401 拒絕 (確認 Same-Origin ≠ Authentication)');
    passCount++;
  }

  // Case 13: logout -> Set-Cookie Max-Age=0, authenticated=false
  {
    const req = createMockReq({
      action: 'sessionLogout',
      payload: {},
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
      cookies: {
        shenyang_session: validSessionCookieValue,
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 13: 應回傳 200');
    assert.strictEqual(res.body?.data?.authenticated, false);

    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie, 'Case 13: 必須有 Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'Case 13: 必須為 Max-Age=0');
    assert.ok(setCookie.includes('HttpOnly'), 'Case 13: 必須包含 HttpOnly');
    console.log('PASS: Case 13 - 登出清除 Cookie (Max-Age=0)');
    passCount++;
  }

  // ==========================================
  // Phase 2B-1C 新增測試案例
  // ==========================================

  // Case 14: 新 endpoint POST /api/session-login 正確 password -> 200, authenticated=true, Set-Cookie present
  {
    const req = createMockReq({
      body: { password: TEST_ENV.APP_ACCESS_PASSWORD },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-proto': 'https',
      },
    });
    const res = createMockRes();
    await sessionLoginHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 14: 獨立端點登入應回傳 200');
    assert.strictEqual(res.body?.ok, true);
    assert.strictEqual(res.body?.data?.authenticated, true);
    assert.ok(res.headers['set-cookie']?.includes('shenyang_session='), 'Case 14: 必須簽發 Cookie');
    console.log('PASS: Case 14 - POST /api/session-login 正確密碼 -> 回傳 200 且簽發 Set-Cookie');
    passCount++;
  }

  // Case 15: POST /api/session-login 錯誤 password -> 401, no Set-Cookie
  {
    const req = createMockReq({
      body: { password: 'bad-password-xyz' },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await sessionLoginHandler(req, res);
    assert.strictEqual(res.statusCode, 401, 'Case 15: 錯誤密碼應回傳 401');
    assert.strictEqual(res.body?.ok, false);
    assert.strictEqual(res.body?.error?.code, 'UNAUTHORIZED');
    assert.strictEqual(res.headers['set-cookie'], undefined, 'Case 15: 不得 Set-Cookie');
    console.log('PASS: Case 15 - POST /api/session-login 錯誤密碼 -> 401 拒絕且無 Set-Cookie');
    passCount++;
  }

  // Case 16: GET /api/session-login -> 405 METHOD_NOT_ALLOWED, Allow: POST
  {
    const req = createMockReq({
      method: 'GET',
      headers: {
        'origin': 'https://shenyang.example.com',
      },
    });
    const res = createMockRes();
    await sessionLoginHandler(req, res);
    assert.strictEqual(res.statusCode, 405, 'Case 16: GET 方法應回傳 405');
    assert.strictEqual(res.headers['allow'], 'POST', 'Case 16: 必須帶 Allow: POST');
    assert.strictEqual(res.body?.error?.code, 'METHOD_NOT_ALLOWED');
    console.log('PASS: Case 16 - GET /api/session-login -> 405 METHOD_NOT_ALLOWED (Allow: POST)');
    passCount++;
  }

  // Case 17: cross-origin POST /api/session-login -> 403 FORBIDDEN
  {
    const req = createMockReq({
      body: { password: TEST_ENV.APP_ACCESS_PASSWORD },
      headers: {
        'origin': 'https://attacker.evil.com',
        'sec-fetch-site': 'cross-site',
      },
    });
    const res = createMockRes();
    await sessionLoginHandler(req, res);
    assert.strictEqual(res.statusCode, 403, 'Case 17: 跨來源登入應回傳 403');
    assert.strictEqual(res.body?.error?.code, 'FORBIDDEN');
    console.log('PASS: Case 17 - 跨站 POST /api/session-login -> 403 FORBIDDEN (防範 CSRF 登入)');
    passCount++;
  }

  // Case 18: 最重要！呼叫舊入口 POST /api/backend action=sessionLogin -> 400 UNKNOWN_ACTION
  {
    const req = createMockReq({
      action: 'sessionLogin',
      payload: { password: TEST_ENV.APP_ACCESS_PASSWORD },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 400, 'Case 18: 舊登入入口必須回傳 400');
    assert.strictEqual(res.body?.error?.code, 'UNKNOWN_ACTION');
    assert.strictEqual(res.headers['set-cookie'], undefined, 'Case 18: 舊入口嚴禁 Set-Cookie');
    console.log('PASS: Case 18 (關鍵驗證) - POST /api/backend action=sessionLogin 遭 400 UNKNOWN_ACTION 阻斷 (無繞過防火牆之後門)');
    passCount++;
  }

  // Case 19: 確認 sessionStatus 仍可透過 /api/backend 使用
  {
    const req = createMockReq({
      action: 'sessionStatus',
      payload: {},
      headers: {
        'origin': 'https://shenyang.example.com',
      },
      cookies: {
        shenyang_session: validSessionCookieValue,
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 19: sessionStatus 應正常回傳 200');
    assert.strictEqual(res.body?.data?.authenticated, true);
    console.log('PASS: Case 19 - sessionStatus 仍可正常透過 /api/backend 查詢');
    passCount++;
  }

  // Case 20: 確認 sessionLogout 仍可透過 /api/backend 使用
  {
    const req = createMockReq({
      action: 'sessionLogout',
      payload: {},
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await backendHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 20: sessionLogout 應正常回傳 200');
    assert.strictEqual(res.body?.data?.authenticated, false);
    assert.ok(res.headers['set-cookie']?.includes('Max-Age=0'), 'Case 20: 必須送出 Max-Age=0');
    console.log('PASS: Case 20 - sessionLogout 仍可正常透過 /api/backend 清除 Session');
    passCount++;
  }

  // Case 21: 前端 error parser 對 HTTP 429 能產生 BackendApiError code=RATE_LIMITED
  {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too Many Requests' },
      }),
    });

    try {
      await requestJson('/api/session-login', { password: 'any' });
      assert.fail('Case 21: 應拋出 BackendApiError');
    } catch (err) {
      assert.ok(err instanceof BackendApiError, 'Case 21: 必須為 BackendApiError 例外');
      assert.strictEqual(err.status, 429);
      assert.strictEqual(err.code, 'RATE_LIMITED');
      assert.strictEqual(err.safeMessage, '嘗試次數過多，請稍後再試。');
      console.log('PASS: Case 21 - 前端 HTTP 解析器對 HTTP 429 產生 RATE_LIMITED 與「嘗試次數過多，請稍後再試。」安全中文提示');
      passCount++;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  console.log(`\n=== 驗證完成：21 / 21 測試案例全數 PASS ===`);
}

runTests().catch((err) => {
  console.error('測試失敗：', err);
  process.exit(1);
});
