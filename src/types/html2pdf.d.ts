declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | [number, number] | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    enableLinks?: boolean;
    html2canvas?: { scale?: number; useCORS?: boolean; letterRendering?: boolean };
    jsPDF?: { unit?: string; format?: string | [number, number]; orientation?: 'portrait' | 'landscape'; compress?: boolean };
    pagebreak?: { mode?: string | string[]; before?: string; after?: string; avoid?: string };
  }

  interface Html2PdfWorker {
    from(element: HTMLElement | string): Html2PdfWorker;
    set(opt: Html2PdfOptions): Html2PdfWorker;
    toPdf(): Html2PdfWorker;
    output(type: 'blob' | 'bloburi' | 'datauristring' | 'pdf'): Promise<any>;
    save(filename?: string): Promise<void>;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(element: HTMLElement | string, opt?: Html2PdfOptions): Html2PdfWorker;
  export default html2pdf;
}
