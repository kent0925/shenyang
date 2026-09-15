/**
 * scripts/test_phase2b_proxy_boundary.mjs - Phase 2B-3A1 Proxy 邊界驗證腳本
 *
 * 驗證重點：
 * 1. Case P1: 內部金鑰 (X-Internal-Api-Key) 放行。
 * 2. Case P2: 同源瀏覽器請求 (Same-Origin) 放行（無需 token）。
 * 3. Case P3: 跨站請求 (Sec-Fetch-Site: cross-site) 遭 403 FORBIDDEN 阻斷。
 * 4. Case P4: 非同源且無內部金鑰請求遭 401 UNAUTHORIZED 拒絕。
 * 5. Case P5: 舊 Session 動作 (sessionLogin, sessionStatus, sessionLogout) 遭 400 UNKNOWN_ACTION 阻斷。
 * 6. Case P6: 驗證環境無需 APP_ACCESS_PASSWORD 與 SESSION_SIGNING_SECRET 即可正常運作。
 */

import assert from 'node:assert';
import backendHandler from '../api/backend.ts';

// 測試環境變數（注意：完全不設定 APP_ACCESS_PASSWORD 與 SESSION_SIGNING_SECRET）
const TEST_ENV = {
  BACKEND_PROXY_TOKEN: 'test-backend-proxy-token-phase2b',
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/mock/exec',
  GAS_API_SHARED_SECRET: 'test-gas-shared-secret',
};

Object.assign(process.env, TEST_ENV);
delete process.env.APP_ACCESS_PASSWORD;
delete process.env.SESSION_SIGNING_SECRET;

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
  } = options;

  const defaultHeaders = {
    'host': 'shenyang.example.com',
    'x-forwarded-proto': 'https',
    ...headers,
  };

  const resolvedBody = body !== undefined ? body : (action !== undefined ? { action, payload } : payload);

  return {
    method,
    headers: defaultHeaders,
    body: resolvedBody,
  };
}

async function runTests() {
  console.log('=== 開始執行 Phase 2B-3A1 Proxy 存取邊界驗證 ===\n');
  let passCount = 0;

  // Mock 全域 fetch 避免轉發至外部真實 GAS
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { mockResult: true, requestedAction: JSON.parse(options.body).action },
      }),
      text: async () => JSON.stringify({ ok: true, data: { mockResult: true } }),
    };
  };

  try {
    // Case P1: 內部金鑰 (X-Internal-Api-Key) 放行
    {
      const req = createMockReq({
        action: 'listProjects',
        headers: {
          'x-internal-api-key': TEST_ENV.BACKEND_PROXY_TOKEN,
          'origin': 'https://external-service.com',
          'sec-fetch-site': 'cross-site',
        },
      });
      const res = createMockRes();
      await backendHandler(req, res);
      assert.strictEqual(res.statusCode, 200, 'Case P1 應回傳 200');
      assert.strictEqual(res.body?.ok, true, 'Case P1 應回傳 ok: true');
      console.log('PASS: Case P1 - 內部金鑰 (X-Internal-Api-Key) 放行');
      passCount++;
    }

    // Case P2: 同源瀏覽器請求 (Same-Origin) 放行
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
      assert.strictEqual(res.statusCode, 200, 'Case P2 應回傳 200');
      assert.strictEqual(res.body?.ok, true, 'Case P2 應回傳 ok: true');
      console.log('PASS: Case P2 - 同源瀏覽器請求 (Same-Origin) 放行');
      passCount++;
    }

    // Case P3: 跨站請求 (Sec-Fetch-Site: cross-site) 遭 403 FORBIDDEN 阻斷
    {
      const req = createMockReq({
        action: 'listProjects',
        headers: {
          'origin': 'https://attacker.evil.com',
          'sec-fetch-site': 'cross-site',
        },
      });
      const res = createMockRes();
      await backendHandler(req, res);
      assert.strictEqual(res.statusCode, 403, 'Case P3 應回傳 403');
      assert.strictEqual(res.body?.error?.code, 'FORBIDDEN');
      console.log('PASS: Case P3 - 跨站請求 (cross-site) 遭 403 FORBIDDEN 阻斷');
      passCount++;
    }

    // Case P4: 非同源且無內部金鑰請求遭 401 UNAUTHORIZED 拒絕
    {
      const req = createMockReq({
        action: 'listProjects',
        headers: {
          'origin': 'https://another-site.com',
        },
      });
      const res = createMockRes();
      await backendHandler(req, res);
      assert.strictEqual(res.statusCode, 401, 'Case P4 應回傳 401');
      assert.strictEqual(res.body?.error?.code, 'UNAUTHORIZED');
      console.log('PASS: Case P4 - 非同源且無內部金鑰請求遭 401 UNAUTHORIZED 拒絕');
      passCount++;
    }

    // Case P5: 舊 Session 動作 (sessionLogin, sessionStatus, sessionLogout) 遭 400 UNKNOWN_ACTION 阻斷
    {
      const deprecatedActions = ['sessionLogin', 'sessionStatus', 'sessionLogout'];
      for (const act of deprecatedActions) {
        const req = createMockReq({
          action: act,
          payload: {},
          headers: {
            'origin': 'https://shenyang.example.com',
            'sec-fetch-site': 'same-origin',
          },
        });
        const res = createMockRes();
        await backendHandler(req, res);
        assert.strictEqual(res.statusCode, 400, `Case P5: ${act} 應回傳 400`);
        assert.strictEqual(res.body?.error?.code, 'UNKNOWN_ACTION', `Case P5: ${act} 錯誤碼應為 UNKNOWN_ACTION`);
        assert.strictEqual(res.headers['set-cookie'], undefined, `Case P5: ${act} 不得有 Set-Cookie`);
      }
      console.log('PASS: Case P5 - 舊 Session 動作 (sessionLogin, sessionStatus, sessionLogout) 均遭 400 UNKNOWN_ACTION 阻斷且無 Set-Cookie');
      passCount++;
    }

    // Case P6: 驗證環境完全無 APP_ACCESS_PASSWORD 與 SESSION_SIGNING_SECRET 運作正常
    {
      assert.strictEqual(process.env.APP_ACCESS_PASSWORD, undefined);
      assert.strictEqual(process.env.SESSION_SIGNING_SECRET, undefined);
      const req = createMockReq({
        action: 'listForms',
        payload: { year: 2026 },
        headers: {
          'origin': 'https://shenyang.example.com',
          'sec-fetch-site': 'same-origin',
        },
      });
      const res = createMockRes();
      await backendHandler(req, res);
      assert.strictEqual(res.statusCode, 200, 'Case P6 應回傳 200');
      assert.strictEqual(res.body?.ok, true, 'Case P6 應回傳 ok: true');
      console.log('PASS: Case P6 - 無 APP_ACCESS_PASSWORD 與 SESSION_SIGNING_SECRET 下運作正常');
      passCount++;
    }

    console.log(`\n=== 驗證完成：${passCount} / 6 測試案例全數 PASS ===`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error('測試失敗：', err);
  process.exit(1);
});
