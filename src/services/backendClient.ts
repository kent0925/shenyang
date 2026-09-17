/**
 * src/services/backendClient.ts - 前端統一後端連線 Client
 *
 * 規範：
 * 1. 統一呼叫 POST /api/backend 或獨立端點，不將 GAS URL、Token、Secret 洩漏至前端。
 * 2. 封裝 BackendApiError，至少保留 HTTP status、backend error code 與 safe message。
 * 3. 嚴格遵循 safe message 原則，向 UI 呈現友善中文提示，絕不暴露內部堆疊與連線設定。
 * 4. 完整分辨：network failure、invalid JSON、HTTP error、UNAUTHORIZED、FORBIDDEN、
 *    RATE_LIMITED (429)、VALIDATION_ERROR、NOT_FOUND、UNKNOWN_ACTION、SERVER_CONFIG_ERROR、
 *    UPSTREAM_HTTP_ERROR、UPSTREAM_PARSE_ERROR、PROXY_NETWORK_ERROR。
 */

export interface BackendRequest<P = any> {
  action: string;
  payload: P;
}

export interface BackendResponseSuccess<T> {
  ok: true;
  data: T;
}

export interface BackendResponseError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type BackendResponse<T> = BackendResponseSuccess<T> | BackendResponseError;

/**
 * 前端後端 API 自訂例外類別
 */
export class BackendApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly safeMessage: string;

  constructor(status: number, code: string, safeMessage: string, rawMessage?: string) {
    super(rawMessage || safeMessage);
    this.name = 'BackendApiError';
    this.status = status;
    this.code = code;
    this.safeMessage = safeMessage;

    // 維持原型鏈正確
    Object.setPrototypeOf(this, BackendApiError.prototype);
  }
}

/**
 * 安全中文錯誤訊息對照表
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: '存取未授權或無存取憑證，請確認權限或重新整理頁面。',
  FORBIDDEN: '拒絕跨來源存取請求或存取權限不足。',
  RATE_LIMITED: '嘗試次數過多，請稍後再試。',
  VALIDATION_ERROR: '資料格式或必填欄位驗證失敗，請檢查輸入內容。',
  NOT_FOUND: '找不到指定的資料項目或資料表。',
  UNKNOWN_ACTION: '不支援的後端操作請求。',
  SERVER_CONFIG_ERROR: '伺服器設定異常，請聯繫系統管理員。',
  UPSTREAM_HTTP_ERROR: '後端資料庫服務連線異常，請稍後再試。',
  UPSTREAM_PARSE_ERROR: '後端資料格式解析失敗，請稍後再試。',
  PROXY_NETWORK_ERROR: '伺服器代理連線逾時或網路錯誤，請稍後再試。',
  NETWORK_FAILURE: '無法連線至後端伺服器，請檢查網路連線。',
  INVALID_JSON: '伺服器回應格式非合法 JSON。',
  METHOD_NOT_ALLOWED: '僅支援 POST 請求方法。',
  INTERNAL_ERROR: '伺服器處理請求時發生錯誤，請稍後再試。',
  HTTP_ERROR: '伺服器連線回應異常，請稍後再試。',
  VERSION_CONFLICT: '此表單已由其他使用者更新，為避免覆蓋最新資料，請重新載入後再編輯。',
};

/**
 * 根據後端錯誤碼與回應取得面向 UI 的安全中文訊息
 */
function resolveSafeMessage(code: string, rawMessage?: string): string {
  if (code === 'VALIDATION_ERROR' || code === 'NOT_FOUND' || code === 'VERSION_CONFLICT') {
    if (rawMessage && !rawMessage.includes('http') && !rawMessage.includes('secret') && !rawMessage.includes('token') && !rawMessage.includes('AppsScript')) {
      return rawMessage;
    }
  }
  return SAFE_ERROR_MESSAGES[code] || (rawMessage && !rawMessage.includes('http') && !rawMessage.includes('secret') ? rawMessage : '系統處理請求時發生未預期錯誤');
}

/**
 * 通用 JSON 請求發送器（支援同源憑證與統一錯誤解析）
 * @param url 請求端點 (e.g. '/api/backend', '/api/session-login')
 * @param body 請求內文字串化物件
 */
export async function requestJson<T>(url: string, body: any): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr: any) {
    throw new BackendApiError(
      0,
      'NETWORK_FAILURE',
      SAFE_ERROR_MESSAGES.NETWORK_FAILURE,
      networkErr?.message || 'Network fetch failed'
    );
  }

  let jsonResult: any;
  try {
    jsonResult = await response.json();
  } catch (jsonErr: any) {
    throw new BackendApiError(
      response.status,
      'INVALID_JSON',
      SAFE_ERROR_MESSAGES.INVALID_JSON,
      'Failed to parse response JSON'
    );
  }

  // 檢查回應協定：ok === true
  if (response.ok && jsonResult && jsonResult.ok === true) {
    return jsonResult.data as T;
  }

  // 失敗狀態碼映射
  let defaultCode = 'HTTP_ERROR';
  if (response.status === 401) {
    defaultCode = 'UNAUTHORIZED';
  } else if (response.status === 403) {
    defaultCode = 'FORBIDDEN';
  } else if (response.status === 429) {
    defaultCode = 'RATE_LIMITED';
  }

  const errorCode = jsonResult?.error?.code || defaultCode;
  const rawErrorMessage = jsonResult?.error?.message;
  const safeMessage = resolveSafeMessage(errorCode, rawErrorMessage);

  throw new BackendApiError(response.status, errorCode, safeMessage, rawErrorMessage);
}

/**
 * 執行後端 API 呼叫 (預設 POST /api/backend)
 * @param action 操作名稱 (e.g. 'listProjects', 'saveProject', 'health')
 * @param payload 請求參數物件
 * @return 回傳成功之 data 泛型物件
 */
export async function sendBackendRequest<T, P extends object = object>(
  action: string,
  payload: P = {} as P
): Promise<T> {
  return requestJson<T>('/api/backend', {
    action,
    payload,
  });
}

export const backendClient = {
  request: sendBackendRequest,
  requestJson,
};
