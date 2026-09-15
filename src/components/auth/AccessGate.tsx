/**
 * src/components/auth/AccessGate.tsx - 系統存取安全解鎖閘門
 *
 * 核心原則：
 * 1. 檢查 sessionStatus：若已解鎖則渲染系統主畫面，若未解鎖則呈現簡潔密碼解鎖頁。
 * 2. 密碼絕不留存於 LocalStorage / SessionStorage。
 * 3. 登入成功即刻清空密碼 state。
 * 4. 錯誤訊息僅呈現安全中文提示，不暴露伺服器內部錯誤與堆疊。
 */

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { sessionAuthService } from '../../services/sessionAuth';
import { BackendApiError } from '../../services/backendClient';
import { Lock, Shield, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

interface AuthContextType {
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AccessGateProps {
  children: React.ReactNode;
}

type GateStatus = 'checking' | 'authenticated' | 'unauthenticated';

export const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [status, setStatus] = useState<GateStatus>('checking');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 初始化檢查 Session 狀態
  const checkStatus = useCallback(async () => {
    setStatus('checking');
    try {
      const isAuth = await sessionAuthService.getSessionStatus();
      setStatus(isAuth ? 'authenticated' : 'unauthenticated');
    } catch {
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 登入處理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !password.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await sessionAuthService.login(password);
      // 成功後立即清空密碼 state
      setPassword('');
      setStatus('authenticated');
    } catch (err: any) {
      if (err instanceof BackendApiError) {
        setErrorMessage(err.safeMessage);
      } else {
        setErrorMessage('登入驗證失敗，請稍後再試。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 登出處理
  const handleLogout = useCallback(async () => {
    try {
      await sessionAuthService.logout();
    } catch {
      // 忽略登出網路異常，強制回到未登入狀態
    } finally {
      setStatus('unauthenticated');
      setPassword('');
      setErrorMessage(null);
    }
  }, []);

  // 1. 檢查中
  if (status === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-medium">系統安全檢查中...</p>
      </div>
    );
  }

  // 2. 已驗證通過：進入主應用
  if (status === 'authenticated') {
    return (
      <AuthContext.Provider value={{ logout: handleLogout }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // 3. 未驗證：顯示最小存取解鎖畫面
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-md mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">公司表單系統</h1>
          <p className="text-xs text-slate-500 mt-1">請輸入存取密碼以解鎖內部作業環境</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              存取密碼
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入存取密碼"
                autoFocus
                disabled={isSubmitting}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition disabled:opacity-50"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition shadow active:scale-[0.99]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>驗證中...</span>
              </>
            ) : (
              <>
                <span>進入系統</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <span className="text-[11px] text-slate-400">
            內部受保護系統・未授權存取將遭記錄
          </span>
        </div>
      </div>
    </div>
  );
};
