import React from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* 標頭 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-base">
              A4 版型即時預覽（{type === 'seal' ? '用印／簽呈' : '請款單'}）
            </span>
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
              與輸出效果一致
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>下載 PDF</span>
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
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/70">
          <div className="shadow-lg rounded">
            {type === 'seal' ? (
              <SealApprovalView data={sealData} id="modal-seal-view" />
            ) : (
              <PaymentRequestView data={paymentData} id="modal-payment-view" />
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>說明：此預覽版型為 A4 標準比例渲染，中文字體清晰，列印或轉為 PDF 時皆不失真。</span>
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
