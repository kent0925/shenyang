import React, { useState, useRef } from 'react';
import { Header } from './components/layout/Header';
import { TabNav, FormTab } from './components/layout/TabNav';
import { SealApprovalForm } from './components/forms/SealApprovalForm';
import { PaymentRequestForm } from './components/forms/PaymentRequestForm';
import { FormRecordsPanel } from './components/forms/FormRecordsPanel';
import { MasterDataPanel } from './components/master-data/MasterDataPanel';
import { PreviewModal } from './components/preview/PreviewModal';
import { SealApprovalView } from './components/preview/SealApprovalView';
import { PaymentRequestView } from './components/preview/PaymentRequestView';
import { INITIAL_SEAL_APPROVAL_DATA, SealApprovalData } from './models/sealApproval';
import { INITIAL_PAYMENT_REQUEST_DATA, PaymentRequestData } from './models/paymentRequest';
import type { FormRecord } from './models/backend';
import { storageService } from './services/storage';
import { deserializeSealApproval, deserializePaymentRequest } from './services/formAdapters';
import { generateSealApprovalExcel } from './generators/excel/sealApprovalExcel';
import { generatePaymentRequestExcel } from './generators/excel/paymentRequestExcel';
import { generatePdfFromElement } from './generators/pdf/pdfHelper';
import { getSealApprovalBaseFilename, getPaymentRequestBaseFilename } from './utils/filename';
import { validateTaxId } from './services/companyLookup';
import {
  Eye,
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  CloudUpload,
  PlusCircle,
} from 'lucide-react';


const MainApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FormTab>('seal');
  const [sealData, setSealData] = useState<SealApprovalData>(INITIAL_SEAL_APPROVAL_DATA);
  const [paymentData, setPaymentData] = useState<PaymentRequestData>(INITIAL_PAYMENT_REQUEST_DATA);

  // 表單後端持久化 ID 追蹤（若有值表示為更新既有表單，若為 null 表示為建立新表單）
  const [currentSealFormId, setCurrentSealFormId] = useState<string | null>(null);
  const [currentPaymentFormId, setCurrentPaymentFormId] = useState<string | null>(null);

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
    } else if (activeTab === 'payment') {
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
      } else if (activeTab === 'payment') {
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
      } else if (activeTab === 'payment') {
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
      } else if (activeTab === 'payment') {
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

  // 0. 儲存表單至後端資料庫
  const handleSaveForm = async () => {
    if (!validateForm()) return;
    setIsProcessing(true);
    setStatusMessage('正在儲存表單至後端資料庫...');

    try {
      if (activeTab === 'seal') {
        const res = await storageService.saveSealApproval(sealData, currentSealFormId || undefined);
        if (res.id) {
          setCurrentSealFormId(res.id);
        }
        setStatusMessage(currentSealFormId ? '用印／簽呈已成功更新！' : '用印／簽呈已成功儲存！');
      } else if (activeTab === 'payment') {
        const res = await storageService.savePaymentRequest(paymentData, currentPaymentFormId || undefined);
        if (res.id) {
          setCurrentPaymentFormId(res.id);
        }
        setStatusMessage(currentPaymentFormId ? '請款單已成功更新！' : '請款單已成功儲存！');
      }
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      alert(`儲存表單失敗：${err.message || err}`);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // 開新表單 / 清空重填
  const handleResetForm = () => {
    if (activeTab === 'seal') {
      if (confirm('確定要建立全新用印／簽呈表單嗎？未儲存的變更將會遺失。')) {
        setSealData(INITIAL_SEAL_APPROVAL_DATA);
        setCurrentSealFormId(null);
        setErrors({});
        setStatusMessage('已切換為全新用印／簽呈表單');
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } else if (activeTab === 'payment') {
      if (confirm('確定要建立全新請款單表單嗎？未儲存的變更將會遺失。')) {
        setPaymentData(INITIAL_PAYMENT_REQUEST_DATA);
        setCurrentPaymentFormId(null);
        setErrors({});
        setStatusMessage('已切換為全新請款單');
        setTimeout(() => setStatusMessage(null), 2500);
      }
    }
  };

  // 從紀錄開啟用印／簽呈表單
  const handleOpenSealForm = (record: FormRecord) => {
    try {
      const hydrated = deserializeSealApproval(record);
      setSealData(hydrated);
      setCurrentSealFormId(record.formId);
      setErrors({});
      setActiveTab('seal');
      setStatusMessage(`已載入用印／簽呈表單：${record.formId}`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(`還原用印／簽呈表單失敗：${err.message || err}`);
    }
  };

  // 從紀錄開啟請款單表單
  const handleOpenPaymentForm = (record: FormRecord) => {
    try {
      const hydrated = deserializePaymentRequest(record);
      setPaymentData(hydrated);
      setCurrentPaymentFormId(record.formId);
      setErrors({});
      setActiveTab('payment');
      setStatusMessage(`已載入請款單表單：${record.formId}`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(`還原請款單失敗：${err.message || err}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Header />

      <main className={`flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 ${activeTab === 'master' || activeTab === 'records' ? 'mb-8' : 'mb-20'}`}>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 表單／主檔頁籤切換 */}
          <TabNav activeTab={activeTab} onChange={(tab) => {
            setActiveTab(tab);
            setErrors({});
          }} />

          {/* 表單填寫區 或 紀錄區 或 主檔管理區 */}
          <div className="p-6 sm:p-8">
            {activeTab === 'seal' && (
              <SealApprovalForm
                data={sealData}
                onChange={setSealData}
                errors={errors}
              />
            )}
            {activeTab === 'payment' && (
              <PaymentRequestForm
                data={paymentData}
                onChange={setPaymentData}
                errors={errors}
              />
            )}
            {activeTab === 'records' && (
              <FormRecordsPanel
                onOpenSealForm={handleOpenSealForm}
                onOpenPaymentForm={handleOpenPaymentForm}
              />
            )}
            {activeTab === 'master' && (
              <MasterDataPanel />
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

      {/* 底部固定操作欄 (ActionBar：僅在表單填寫分頁顯示) */}
      {(activeTab === 'seal' || activeTab === 'payment') && (
        <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 py-3 px-4 shadow-lg">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {activeTab === 'seal' ? (
                currentSealFormId ? (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-mono">
                    編輯既有紀錄：{currentSealFormId}
                  </span>
                ) : (
                  <span className="text-slate-500">全新用印／簽呈表單</span>
                )
              ) : (
                currentPaymentFormId ? (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-mono">
                    編輯既有紀錄：{currentPaymentFormId}
                  </span>
                ) : (
                  <span className="text-slate-500">全新請款單</span>
                )
              )}

              {/* 開新表單按鈕 */}
              <button
                type="button"
                onClick={handleResetForm}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 ml-2 transition underline disabled:opacity-50"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>開新表單</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm active:scale-95 disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4" />
                <span>儲存表單</span>
              </button>

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
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition shadow-md active:scale-95 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Excel + PDF</span>
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* 彈窗預覽 */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        type={activeTab === 'payment' ? 'payment' : 'seal'}
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

export const App: React.FC = () => {
  return <MainApp />;
};

export default App;
