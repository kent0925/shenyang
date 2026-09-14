import React, { useState, useRef } from 'react';
import { Header } from './components/layout/Header';
import { TabNav, FormTab } from './components/layout/TabNav';
import { SealApprovalForm } from './components/forms/SealApprovalForm';
import { PaymentRequestForm } from './components/forms/PaymentRequestForm';
import { PreviewModal } from './components/preview/PreviewModal';
import { SealApprovalView } from './components/preview/SealApprovalView';
import { PaymentRequestView } from './components/preview/PaymentRequestView';
import { INITIAL_SEAL_APPROVAL_DATA, SealApprovalData } from './models/sealApproval';
import { INITIAL_PAYMENT_REQUEST_DATA, PaymentRequestData } from './models/paymentRequest';
import { generateSealApprovalExcel } from './generators/excel/sealApprovalExcel';
import { generatePaymentRequestExcel } from './generators/excel/paymentRequestExcel';
import { generatePdfFromElement } from './generators/pdf/pdfHelper';
import { getSealApprovalBaseFilename, getPaymentRequestBaseFilename } from './utils/filename';
import { validateTaxId } from './services/companyLookup';
import { Eye, FileSpreadsheet, FileText, Download, Loader2, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FormTab>('seal');
  const [sealData, setSealData] = useState<SealApprovalData>(INITIAL_SEAL_APPROVAL_DATA);
  const [paymentData, setPaymentData] = useState<PaymentRequestData>(INITIAL_PAYMENT_REQUEST_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sealPdfRef = useRef<HTMLDivElement>(null);
  const paymentPdfRef = useRef<HTMLDivElement>(null);

  // 下載 Blob 檔案之通用輔助函式
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 必填欄位驗證
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (activeTab === 'seal') {
      if (!sealData.company.trim()) newErrors.company = '請選擇或填寫公司名稱';
      if (!sealData.applyDate) newErrors.applyDate = '請選擇申請日期';
      if (!sealData.subject.trim()) newErrors.subject = '請填寫主旨';
      if (sealData.types.length === 0) newErrors.types = '請至少選擇一種申請類型';
    } else {
      if (!paymentData.company.trim()) newErrors.company = '請選擇或填寫公司名稱';
      if (!paymentData.applyDate) newErrors.applyDate = '請選擇申請日期';
      if (!paymentData.vendor.trim()) newErrors.vendor = '請填寫受款人／廠商';
      if (!paymentData.currentAmount.trim()) newErrors.currentAmount = '請填寫本期請款／驗收／預付額';
      if (paymentData.vendorTaxId && paymentData.vendorTaxId.trim()) {
        const taxId = paymentData.vendorTaxId.trim();
        if (taxId.length !== 8 || !validateTaxId(taxId)) {
          newErrors.vendorTaxId = '統一編號必須為合法的 8 碼數字';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 1. 預覽
  const handlePreview = () => {
    if (!validateForm()) return;
    setIsPreviewOpen(true);
  };

  // 2. 下載 Excel
  const handleDownloadExcel = async () => {
    if (!validateForm()) return;
    setIsProcessing(true);
    setStatusMessage('正在產生 Excel 檔案...');

    try {
      if (activeTab === 'seal') {
        const blob = await generateSealApprovalExcel(sealData);
        const baseName = getSealApprovalBaseFilename(sealData.subject, sealData.applyDate, sealData.types);
        downloadBlob(blob, `${baseName}.xlsm`);
      } else {
        const blob = await generatePaymentRequestExcel(paymentData);
        const baseName = getPaymentRequestBaseFilename(paymentData.project, paymentData.vendor, paymentData.applyDate);
        downloadBlob(blob, `${baseName}.xlsx`);
      }
      setStatusMessage('Excel 產生完成並已開始下載！');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(`產生 Excel 失敗：${err.message || err}`);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. 下載 PDF
  const handleDownloadPdf = async () => {
    if (!validateForm()) return;
    setIsProcessing(true);
    setStatusMessage('正在排版並產生 PDF...');

    try {
      if (activeTab === 'seal') {
        const el = document.getElementById('hidden-seal-view');
        if (!el) throw new Error('找不到列印渲染容器');
        const baseName = getSealApprovalBaseFilename(sealData.subject, sealData.applyDate, sealData.types);
        const blob = await generatePdfFromElement(el, `${baseName}.pdf`);
        downloadBlob(blob, `${baseName}.pdf`);
      } else {
        const el = document.getElementById('hidden-payment-view');
        if (!el) throw new Error('找不到列印渲染容器');
        const baseName = getPaymentRequestBaseFilename(paymentData.project, paymentData.vendor, paymentData.applyDate);
        const blob = await generatePdfFromElement(el, `${baseName}.pdf`);
        downloadBlob(blob, `${baseName}.pdf`);
      }
      setStatusMessage('PDF 產生完成並已開始下載！');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(`產生 PDF 失敗：${err.message || err}`);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. 下載 Excel + PDF
  const handleDownloadBoth = async () => {
    if (!validateForm()) return;
    setIsProcessing(true);
    setStatusMessage('正在連續產生 Excel 與 PDF 檔案...');

    try {
      if (activeTab === 'seal') {
        const baseName = getSealApprovalBaseFilename(sealData.subject, sealData.applyDate, sealData.types);
        const excelBlob = await generateSealApprovalExcel(sealData);
        downloadBlob(excelBlob, `${baseName}.xlsm`);

        const el = document.getElementById('hidden-seal-view');
        if (el) {
          const pdfBlob = await generatePdfFromElement(el, `${baseName}.pdf`);
          downloadBlob(pdfBlob, `${baseName}.pdf`);
        }
      } else {
        const baseName = getPaymentRequestBaseFilename(paymentData.project, paymentData.vendor, paymentData.applyDate);
        const excelBlob = await generatePaymentRequestExcel(paymentData);
        downloadBlob(excelBlob, `${baseName}.xlsx`);

        const el = document.getElementById('hidden-payment-view');
        if (el) {
          const pdfBlob = await generatePdfFromElement(el, `${baseName}.pdf`);
          downloadBlob(pdfBlob, `${baseName}.pdf`);
        }
      }
      setStatusMessage('Excel 與 PDF 已全部成功下載！');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      alert(`連續下載失敗：${err.message || err}`);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 mb-20">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 表單頁籤切換 */}
          <TabNav activeTab={activeTab} onChange={(tab) => {
            setActiveTab(tab);
            setErrors({});
          }} />

          {/* 表單填寫區 */}
          <div className="p-6 sm:p-8">
            {activeTab === 'seal' ? (
              <SealApprovalForm
                data={sealData}
                onChange={setSealData}
                errors={errors}
              />
            ) : (
              <PaymentRequestForm
                data={paymentData}
                onChange={setPaymentData}
                errors={errors}
              />
            )}
          </div>
        </div>
      </main>

      {/* 狀態浮動提示 */}
      {statusMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-sm">
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 底部固定操作欄 (ActionBar) */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 py-3 px-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 hidden sm:block">
            {activeTab === 'seal' ? '用印／簽呈表單' : '請款單表單'}・下載前將自動檢查必填項目
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handlePreview}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition active:scale-95 disabled:opacity-50"
            >
              <Eye className="w-4 h-4 text-slate-600" />
              <span>預覽</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition shadow-sm active:scale-95 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>下載 Excel</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition shadow-sm active:scale-95 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>下載 PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadBoth}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition shadow-md active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Excel + PDF</span>
            </button>
          </div>
        </div>
      </footer>

      {/* 彈窗預覽 */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        type={activeTab}
        sealData={sealData}
        paymentData={paymentData}
        onDownloadExcel={handleDownloadExcel}
        onDownloadPdf={handleDownloadPdf}
      />

      {/* 背景隱藏列印容器（用於產生高品質 PDF，不干擾畫面） */}
      <div className="absolute left-[-9999px] top-[-9999px] w-[820px] bg-white">
        <div ref={sealPdfRef}>
          <SealApprovalView data={sealData} id="hidden-seal-view" />
        </div>
        <div ref={paymentPdfRef}>
          <PaymentRequestView data={paymentData} id="hidden-payment-view" />
        </div>
      </div>
    </div>
  );
};

export default App;
