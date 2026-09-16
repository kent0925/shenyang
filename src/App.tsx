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
import { parseSafeAmount } from './services/budgetUsage';
import { validatePaymentHierarchy, PaymentValidationMode } from './services/paymentValidation';
import { backendStorageService } from './services/backendStorage';
import { blobToBase64, downloadBlob } from './utils/fileBlob';
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


interface PendingArchiveInfo {
  formId: string;
  formType: 'seal' | 'payment';
  snapshotJson: string;
}

const MainApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FormTab>('seal');
  const [sealData, setSealData] = useState<SealApprovalData>(INITIAL_SEAL_APPROVAL_DATA);
  const [paymentData, setPaymentData] = useState<PaymentRequestData>(INITIAL_PAYMENT_REQUEST_DATA);

  // 表單後端持久化 ID 追蹤（若有值表示為更新既有表單，若為 null 表示為建立新表單）
  const [currentSealFormId, setCurrentSealFormId] = useState<string | null>(null);
  const [currentPaymentFormId, setCurrentPaymentFormId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<PendingArchiveInfo | null>(null);
  const [isPaymentOverBudget, setIsPaymentOverBudget] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sealPdfRef = useRef<HTMLDivElement>(null);
  const paymentPdfRef = useRef<HTMLDivElement>(null);


  // 必填欄位驗證
  const validateForm = (mode: PaymentValidationMode = 'read'): boolean => {
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

      const currentAmt = parseSafeAmount(paymentData.currentAmount);
      if (!paymentData.currentAmount.trim()) {
        newErrors.currentAmount = '請填寫本期請款／驗收／預付額';
      } else if (currentAmt <= 0) {
        newErrors.currentAmount = '請填寫大於 0 之有效請款金額';
      }

      const isBudgeted = paymentData.budgetType !== 'unbudgeted';
      if (mode === 'write' || !(currentPaymentFormId && !paymentData.subProjectId)) {
        Object.assign(newErrors, validatePaymentHierarchy(paymentData, mode, currentPaymentFormId));
      }
      if (isBudgeted) {
        if (!paymentData.budgetItemId) {
          newErrors.budgetItemId = '請選擇預算項目';
        }
        if (isPaymentOverBudget) {
          newErrors.budgetItemId = '本次請款金額超出預算可用額度，無法儲存';
        }
      }

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

  // 官方主要正式動作：完成並產生表單（儲存最新 Form -> 產出雙檔 -> 同時歸檔 Google Drive -> 回寫 IDs -> 本機下載雙檔）
  const handleCompleteAndGenerate = async () => {
    if (!validateForm('write')) return;
    setIsProcessing(true);

    const currentFormType = activeTab as 'seal' | 'payment';
    const currentDataJson = JSON.stringify(currentFormType === 'seal' ? sealData : paymentData);

    // 檢查是否有同表單類型且內容完全未修改之 pending archive
    const canReusePending = Boolean(
      pendingArchive &&
      pendingArchive.formType === currentFormType &&
      pendingArchive.snapshotJson === currentDataJson &&
      pendingArchive.formId
    );

    let targetFormId = canReusePending && pendingArchive ? pendingArchive.formId : '';

    try {
      // 1. 若非有效的 pending 重試狀態，先執行表單儲存
      if (!canReusePending) {
        setStatusMessage('正在儲存最新表單資料...');
        try {
          if (currentFormType === 'seal') {
            const res = await storageService.saveSealApproval(sealData, currentSealFormId || undefined);
            if (!res.id) throw new Error('儲存用印／簽呈後未取得有效表單編號');
            targetFormId = res.id;
            setCurrentSealFormId(res.id);
          } else {
            const res = await storageService.savePaymentRequest(paymentData, currentPaymentFormId || undefined);
            if (!res.id) throw new Error('儲存請款單後未取得有效表單編號');
            targetFormId = res.id;
            setCurrentPaymentFormId(res.id);
          }
          // 儲存成功，記錄 pendingArchive 狀態
          setPendingArchive({
            formId: targetFormId,
            formType: currentFormType,
            snapshotJson: currentDataJson,
          });
        } catch (saveErr: any) {
          // 初始儲存失敗：絕不宣稱表單已妥善儲存！絕不設定 pending archive！
          setPendingArchive(null);
          alert(`「完成並產生表單」儲存失敗：${saveErr.message || saveErr}`);
          setStatusMessage(null);
          return;
        }
      } else {
        setStatusMessage('偵測到前次已儲存之表單，直接進行產檔與雲端歸檔重試...');
      }

      if (!targetFormId) {
        throw new Error('未取得有效表單編號，無法進行產檔歸檔');
      }

      // 2. 使用現有 generator 產生 Excel/XLSM Blob
      setStatusMessage('正在產生 Excel/XLSM 檔案...');
      let excelBlob: Blob;
      let excelFileName: string;
      let excelMimeType: string;

      if (currentFormType === 'seal') {
        const baseName = getSealApprovalBaseFilename(sealData.subject, sealData.applyDate, sealData.types);
        excelFileName = `${baseName}.xlsm`;
        excelMimeType = 'application/vnd.ms-excel.sheet.macroEnabled.12';
        excelBlob = await generateSealApprovalExcel(sealData);
      } else {
        const baseName = getPaymentRequestBaseFilename(paymentData.project, paymentData.vendor, paymentData.applyDate);
        excelFileName = `${baseName}.xlsx`;
        excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        excelBlob = await generatePaymentRequestExcel(paymentData);
      }

      // 3. 使用現有 PDF generator 產生 PDF Blob
      setStatusMessage('正在排版並產生 PDF 檔案...');
      let pdfBlob: Blob;
      let pdfFileName: string;
      const pdfMimeType = 'application/pdf';

      if (currentFormType === 'seal') {
        const el = document.getElementById('hidden-seal-view');
        if (!el) throw new Error('找不到用印簽呈列印渲染容器');
        const baseName = getSealApprovalBaseFilename(sealData.subject, sealData.applyDate, sealData.types);
        pdfFileName = `${baseName}.pdf`;
        pdfBlob = await generatePdfFromElement(el, pdfFileName);
      } else {
        const el = document.getElementById('hidden-payment-view');
        if (!el) throw new Error('找不到請款單列印渲染容器');
        const baseName = getPaymentRequestBaseFilename(paymentData.project, paymentData.vendor, paymentData.applyDate);
        pdfFileName = `${baseName}.pdf`;
        pdfBlob = await generatePdfFromElement(el, pdfFileName);
      }

      // 4. 將兩個 Blob 轉為 raw base64
      setStatusMessage('正在同步上傳歸檔至 Google Drive...');
      const [excelBase64, pdfBase64] = await Promise.all([
        blobToBase64(excelBlob),
        blobToBase64(pdfBlob),
      ]);

      // 5. 呼叫後端歸檔 API（單一請求原子操作）
      await backendStorageService.archiveFormFiles({
        formId: targetFormId,
        excel: {
          fileName: excelFileName,
          mimeType: excelMimeType,
          base64: excelBase64,
        },
        pdf: {
          fileName: pdfFileName,
          mimeType: pdfMimeType,
          base64: pdfBase64,
        },
      });

      // 6. archive 成功後，清除 pending 狀態
      setPendingArchive(null);

      // 7. 本機下載 Excel/XLSM 與 PDF（重要：本機下載的 Blob 必須就是剛剛上傳歸檔的同一份 Blob）
      downloadBlob(excelBlob, excelFileName);
      downloadBlob(pdfBlob, pdfFileName);

      // 8. 正式完成訊息
      setStatusMessage('表單已完成：Excel / PDF 已下載並同步歸檔至雲端');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (archiveErr: any) {
      // 歸檔階段失敗：因 Form Save 已成功，保留 pending 狀態供重試，顯示可重試之明確提示
      alert(`「完成並產生表單」雲端歸檔失敗：${archiveErr.message || archiveErr}\n\n表單資料已儲存，可再次點擊「完成並產生表單」重試歸檔。`);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // 0. 儲存表單至後端資料庫
  const handleSaveForm = async () => {
    if (!validateForm('write')) return;
    setIsProcessing(true);
    setStatusMessage('正在儲存表單至後端資料庫...');

    try {
      if (activeTab === 'seal') {
        const res = await storageService.saveSealApproval(sealData, currentSealFormId || undefined);
        if (res.id) {
          setCurrentSealFormId(res.id);
          setPendingArchive({
            formId: res.id,
            formType: 'seal',
            snapshotJson: JSON.stringify(sealData),
          });
        }
        setStatusMessage(currentSealFormId ? '用印／簽呈已成功更新！' : '用印／簽呈已成功儲存！');
      } else if (activeTab === 'payment') {
        const res = await storageService.savePaymentRequest(paymentData, currentPaymentFormId || undefined);
        if (res.id) {
          setCurrentPaymentFormId(res.id);
          setPendingArchive({
            formId: res.id,
            formType: 'payment',
            snapshotJson: JSON.stringify(paymentData),
          });
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
        setPendingArchive(null);
        setErrors({});
        setStatusMessage('已切換為全新用印／簽呈表單');
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } else if (activeTab === 'payment') {
      if (confirm('確定要建立全新請款單表單嗎？未儲存的變更將會遺失。')) {
        setPaymentData(INITIAL_PAYMENT_REQUEST_DATA);
        setCurrentPaymentFormId(null);
        setPendingArchive(null);
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
      setPendingArchive(null);
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
      setPendingArchive(null);
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

      <main className={`flex-1 max-w-5xl w-full mx-auto p-3 sm:p-6 ${activeTab === 'master' || activeTab === 'records' ? 'mb-8' : 'mb-36 sm:mb-24'}`}>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 表單／主檔頁籤切換 */}
          <TabNav activeTab={activeTab} onChange={(tab) => {
            setActiveTab(tab);
            setErrors({});
          }} />

          {/* 表單填寫區 或 紀錄區 或 主檔管理區 */}
          <div className="p-4 sm:p-6 lg:p-8">
            {activeTab === 'seal' && (
              <SealApprovalForm
                data={sealData}
                onChange={(next) => {
                  setSealData(next);
                  if (pendingArchive && pendingArchive.formType === 'seal') {
                    if (JSON.stringify(next) !== pendingArchive.snapshotJson) {
                      setPendingArchive(null);
                    }
                  }
                }}
                errors={errors}
              />
            )}
            {activeTab === 'payment' && (
              <PaymentRequestForm
                data={paymentData}
                onChange={(next) => {
                  setPaymentData(next);
                  if (pendingArchive && pendingArchive.formType === 'payment') {
                    if (JSON.stringify(next) !== pendingArchive.snapshotJson) {
                      setPendingArchive(null);
                    }
                  }
                }}
                errors={errors}
                currentFormId={currentPaymentFormId || undefined}
                onOverBudgetChange={setIsPaymentOverBudget}
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
        <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 py-2.5 sm:py-3 px-3 sm:px-6 shadow-lg">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
            {/* 狀態資訊與開新表單 */}
            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 text-xs text-slate-600">
              <div className="truncate">
                {activeTab === 'seal' ? (
                  currentSealFormId ? (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-mono text-xs">
                      編輯：{currentSealFormId}
                    </span>
                  ) : (
                    <span className="text-slate-500 font-medium">全新用印／簽呈表單</span>
                  )
                ) : (
                  currentPaymentFormId ? (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-mono text-xs">
                      編輯：{currentPaymentFormId}
                    </span>
                  ) : (
                    <span className="text-slate-500 font-medium">全新請款單</span>
                  )
                )}
              </div>

              {/* 開新表單按鈕 */}
              <button
                type="button"
                onClick={handleResetForm}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 px-2 py-1 rounded-md hover:bg-slate-100 transition underline disabled:opacity-50 flex-shrink-0"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>開新表單</span>
              </button>
            </div>

            {/* 操作按鈕群：Mobile 採分列結構，Desktop 單列 */}
            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* 官方核心主操作：完成並產生表單（一鍵完成：儲存+產檔+雲端歸檔+本機雙檔下載） */}
              <button
                type="button"
                onClick={handleCompleteAndGenerate}
                disabled={isProcessing}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl text-sm font-bold transition shadow-md active:scale-95 disabled:opacity-50 min-h-[42px]"
                title="儲存最新表單、產生 Excel/XLSM 及 PDF、同步歸檔至 Google Drive 並於本機下載"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>完成並產生表單</span>
              </button>

              {/* 次要操作（儲存、預覽） */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveForm}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition active:scale-95 disabled:opacity-50 min-h-[40px]"
                >
                  <CloudUpload className="w-4 h-4 text-blue-600" />
                  <span>儲存表單</span>
                </button>

                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition active:scale-95 disabled:opacity-50 min-h-[40px]"
                >
                  <Eye className="w-4 h-4 text-slate-600" />
                  <span>預覽</span>
                </button>
              </div>

              {/* 下載操作（Excel、PDF、兩者） */}
              <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-1 px-2.5 sm:px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-medium transition shadow-sm active:scale-95 disabled:opacity-50 min-h-[40px]"
                  title="下載 Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="sm:inline hidden">下載 Excel</span>
                  <span className="sm:hidden inline">Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-1 px-2.5 sm:px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs sm:text-sm font-medium transition shadow-sm active:scale-95 disabled:opacity-50 min-h-[40px]"
                  title="下載 PDF"
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="sm:inline hidden">下載 PDF</span>
                  <span className="sm:hidden inline">PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBoth}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-1 px-2.5 sm:px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-semibold transition shadow-md active:scale-95 disabled:opacity-50 min-h-[40px]"
                  title="同時下載 Excel 與 PDF"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="sm:inline hidden">Excel + PDF</span>
                  <span className="sm:hidden inline">雙檔</span>
                </button>
              </div>
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
