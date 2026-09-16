/**
 * src/utils/fileBlob.ts - 檔案 Blob、Base64 互轉與瀏覽器下載/列印工具
 */

/**
 * 將 Blob 轉為 raw base64 字串（自動去除 data:mime/type;base64, 前綴）
 * @param blob 檔案 Blob
 * @return raw base64 字串
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result) {
        resolve('');
        return;
      }
      // 去除 data:application/...;base64, 前綴
      const commaIndex = result.indexOf(',');
      const rawBase64 = commaIndex !== -1 ? result.slice(commaIndex + 1) : result;
      resolve(rawBase64);
    };
    reader.onerror = (err) => {
      reject(err);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * 將 raw base64 字串轉為標準 Blob 物件
 * @param base64 raw base64 字串
 * @param mimeType MIME 類型
 * @return Blob
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * 觸發瀏覽器下載 Blob 檔案
 * @param blob 檔案 Blob
 * @param filename 下載檔案名稱
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延遲釋放以確保瀏覽器完成下載動作
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 觸發瀏覽器列印 PDF Blob（利用隱藏 iframe 免跳頁列印）
 * @param blob PDF Blob
 */
export function printBlobPdf(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      // 若跨網域/沙盒限制無法 print，改用 window.open
      const printWin = window.open(url, '_blank');
      printWin?.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60000);
    }
  };

  document.body.appendChild(iframe);
}
