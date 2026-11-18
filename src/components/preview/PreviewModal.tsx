import React from 'react';
import { X, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { SealApprovalData } from '../../models/sealApproval';
import { PaymentRequestData } from '../../models/paymentRequest';
import { SealApprovalView } from './SealApprovalView';
import { PaymentRequestView } from './PaymentRequestView';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  type: 'seal' | 'payment';
  sealData: SealApprovalData;
  paymentData: PaymentRequestData;
  onDownloadExcel: () => void;
  onDownloadPdf: () => void;
}

export const PreviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  type,
  sealData,
  paymentData,
  onDownloadExcel,
  onDownloadPdf,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 preview-modal-backdrop">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 preview-modal-dialog">
        {/* 標頭 (列印時隱藏) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 no-print">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-base">
              A4 版型即時預覽（{type === 'seal' ? '用印／簽呈' : '請款單'}）
            </span>
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
              與輸出效果一致
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 方案 B：瀏覽器原生向量列印 / 另存為 PDF */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-sm"
              title="使用瀏覽器原生列印另存為 PDF（100% 向量真實文字，清晰不模糊、不切字、永不失真）"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>另存為 PDF / 列印</span>
            </button>
            <button
              type="button"
              onClick={onDownloadExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>下載 Excel</span>
            </button>
            <button
              type="button"
              onClick={onDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition shadow-sm"
              title="一鍵自動下載 PDF（點陣圖檔封裝）"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>自動下載 PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 預覽內容區 */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/70 preview-modal-content">
          <div className="shadow-lg rounded print:shadow-none print:rounded-none">
            {type === 'seal' ? (
              <SealApprovalView data={sealData} id="modal-seal-view" />
            ) : (
              <PaymentRequestView data={paymentData} id="modal-payment-view" />
            )}
          </div>
        </div>

        {/* 底部 (列印時隱藏) */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 no-print">
          <span className="text-slate-600">
            提示：若要取得<strong>100% 向量真實文字</strong>，請點擊上方藍色<strong>「另存為 PDF / 列印」</strong>按鈕（目的地選擇「另存為 PDF」）。已自動最佳化 A4 寬度，四邊框線完整收邊不被裁切。
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg font-medium text-slate-700"
          >
            關閉預覽
          </button>
        </div>
      </div>
    </div>
  );
};
