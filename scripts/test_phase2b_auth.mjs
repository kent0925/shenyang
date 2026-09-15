/**
 * scripts/test_phase2b_auth.mjs - Phase 2B-1B 授權邊界自動化驗證腳本
 *
 * 驗證目標：
 * 1. 驗證 Phase 2B-1B 新增的 Server-Signed Session 授權邊界、Cookie 安全設定、Same-Origin CSRF 防護。
 * 2. 驗證 Case 1 ~ Case 13 完整行為。
 * 3. 純 Node.js 原生執行，不新增任何第三方測試套件依賴。
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import handler from '../api/backend.ts';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  parseCookies,
  buildSessionCookie,
  buildClearSessionCookie,
} from '../server/sessionAuth.ts';

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
    action = 'listProjects',
    payload = {},
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

  return {
    method,
    headers: defaultHeaders,
    body: {
      action,
      payload,
    },
  };
}

async function runTests() {
  console.log('=== 開始執行 Phase 2B-1B 授權邊界安全驗證 ===\n');
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
    await handler(req, res);
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
    await handler(req, res);
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
    // 攔截 fetch 模擬 GAS 回應
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: [{ projectId: 'PRJ-2026-000001' }] }),
    });

    try {
      await handler(req, res);
      assert.strictEqual(res.statusCode, 200, 'Case 3: 應回傳 200');
      assert.strictEqual(res.body?.ok, true);
      assert.deepStrictEqual(res.body?.data, [{ projectId: 'PRJ-2026-000001' }]);
      console.log('PASS: Case 3 - 正確 internal key -> 順利通過驗證並轉發 (Automation 相容)');
      passCount++;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Case 4: 正確 login password -> sessionLogin → 200, Set-Cookie 屬性齊全
  let validSessionCookieValue = '';
  {
    const req = createMockReq({
      action: 'sessionLogin',
      payload: { password: TEST_ENV.APP_ACCESS_PASSWORD },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-proto': 'https',
      },
    });
    const res = createMockRes();
    await handler(req, res);
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

    // 擷取 Cookie Value 供後續測試使用
    const match = setCookie.match(/shenyang_session=([^;]+)/);
    validSessionCookieValue = decodeURIComponent(match[1]);
    console.log('PASS: Case 4 - 正確密碼登入 -> 回傳 200 且簽發完整安全的 HttpOnly Cookie');
    passCount++;
  }

  // Case 5: 錯誤 password -> 401, 不得 Set-Cookie
  {
    const req = createMockReq({
      action: 'sessionLogin',
      payload: { password: 'wrong-password' },
      headers: {
        'origin': 'https://shenyang.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    const res = createMockRes();
    await handler(req, res);
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
    await handler(req, res);
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
    await handler(req, res);
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
    await handler(req, res);
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
    await handler(req2, res2);
    assert.strictEqual(res2.statusCode, 401, 'Case 8: 竄改 token 存取 API 應回傳 401');
    console.log('PASS: Case 8 - 遭竄改之 session token 經 constant-time 比對判定無效');
    passCount++;
  }

  // Case 9: expired session -> 401
  {
    // 手動建構已過期 token
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
    await handler(req, res);
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
      await handler(req, res);
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
    await handler(req, res);
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
      // 完全沒有帶 session cookie
    });
    const res = createMockRes();
    await handler(req, res);
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
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Case 13: 應回傳 200');
    assert.strictEqual(res.body?.data?.authenticated, false);

    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie, 'Case 13: 必須有 Set-Cookie');
    assert.ok(setCookie.includes('Max-Age=0'), 'Case 13: 必須為 Max-Age=0');
    assert.ok(setCookie.includes('HttpOnly'), 'Case 13: 必須包含 HttpOnly');
    console.log('PASS: Case 13 - 登出清除 Cookie (Max-Age=0)');
    passCount++;
  }

  console.log(`\n=== 驗證完成：13 / 13 測試案例全數 PASS ===`);
}

runTests().catch((err) => {
  console.error('測試失敗：', err);
  process.exit(1);
});
