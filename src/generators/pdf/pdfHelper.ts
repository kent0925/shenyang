import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * 將指定的 HTML 元素以高解析度 Canvas 轉為單頁 A4 PDF
 * 精確計算等比例縮放，保證 100% 容納於單一頁 A4 之中，徹底杜絕多出第二頁空白頁的問題
 */
export async function generatePdfFromElement(element: HTMLElement, filename: string): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    scrollY: 0,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  if (filename) {
    pdf.setDocumentProperties({
      title: filename,
    });
  }

  // A4 標準尺寸：210mm x 297mm
  // 邊界：左右各 6mm (可用 198mm), 上下各 4mm (可用 289mm)
  const marginX = 6;
  const marginY = 4;
  const maxWidth = 210 - marginX * 2; // 198mm
  const maxHeight = 297 - marginY * 2; // 289mm

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const ratio = canvasWidth / canvasHeight;

  let renderWidth = maxWidth;
  let renderHeight = renderWidth / ratio;

  // 若等比例縮放後的高度超出可列印高度，則依最大高度縮放，保證絕不溢出
  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = renderHeight * ratio;
  }

  // 水平置中
  const posX = marginX + (maxWidth - renderWidth) / 2;
  const posY = marginY;

  pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');
  const pdfBlob = pdf.output('blob');
  return pdfBlob;
}
