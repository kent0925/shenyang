/**
 * src/services/sessionAuth.ts - 前端 Session 認證管理服務
 *
 * 核心原則：
 * 1. 全面透過共用 backendClient 與 POST /api/backend 通訊。
 * 2. 嚴禁在前端儲存密碼或接觸任何伺服器金鑰。
 * 3. 處理 sessionStatus、sessionLogin 與 sessionLogout 操作。
 */

import { backendClient } from './backendClient';
import type { SessionStatusData } from '../models/backend';

export class SessionAuthService {
  /**
   * 檢查當前瀏覽器 Session 是否有效
   */
  async getSessionStatus(): Promise<boolean> {
    try {
      const result = await backendClient.request<SessionStatusData>('sessionStatus', {});
      return Boolean(result && result.authenticated);
    } catch {
      return false;
    }
  }

  /**
   * 輸入共享存取密碼解鎖系統（呼叫獨立端點 POST /api/session-login）
   * @param password 使用者輸入之密碼
   */
  async login(password: string): Promise<void> {
    await backendClient.requestJson<SessionStatusData>('/api/session-login', {
      password,
    });
  }

  /**
   * 登出並清除伺服器 HttpOnly Cookie
   */
  async logout(): Promise<void> {
    await backendClient.request<SessionStatusData>('sessionLogout', {});
  }
}

export const sessionAuthService = new SessionAuthService();
