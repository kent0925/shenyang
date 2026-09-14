import html2pdf from 'html2pdf.js';

export async function generatePdfFromElement(element: HTMLElement, filename: string): Promise<Blob> {
  const opt = {
    margin: [10, 10, 10, 10] as [number, number, number, number],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const, compress: true },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  const pdfWorker = html2pdf().set(opt).from(element);
  const pdfBlob = await pdfWorker.output('blob');
  return pdfBlob;
}
