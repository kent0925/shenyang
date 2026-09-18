import type { ConstructionMetadata, Orientation, PendingAttachment, ProcessedPhoto } from '../models/attachments';

export function orientation(width: number, height: number): Orientation {
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
}
export function reorderPhotos(photos: ProcessedPhoto[], from: number, to: number): ProcessedPhoto[] {
  if (from < 0 || to < 0 || from >= photos.length || to >= photos.length) return photos;
  const next = [...photos]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
}
export function contain(width: number, height: number, x: number, y: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { x: x + (boxWidth - width * scale) / 2, y: y + (boxHeight - height * scale) / 2,
    width: width * scale, height: height * scale };
}
function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('照片壓縮失敗。')), 'image/jpeg', quality));
}
async function compress(source: ImageBitmap, rotation = 0): Promise<{ blob: Blob; width: number; height: number }> {
  const swap = rotation % 180 !== 0;
  let longEdge = Math.min(1800, Math.max(source.width, source.height));
  let quality = 0.82;
  for (;;) {
    const scale = longEdge / Math.max(source.width, source.height);
    const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = swap ? h : w; canvas.height = swap ? w : h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(source, -w / 2, -h / 2, w, h);
    const blob = await canvasBlob(canvas, quality);
    const result = { blob, width: canvas.width, height: canvas.height };
    canvas.width = canvas.height = 0;
    if (blob.size <= 1.2 * 1024 * 1024) return result;
    longEdge *= 0.85; quality = Math.max(0.6, quality - 0.05);
  }
}

export async function importPhoto(file: File): Promise<ProcessedPhoto> {
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('照片僅支援 JPEG、PNG、WEBP、HEIC／HEIF。');
  let source: Blob = file;
  if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
    const { heicTo } = await import('heic-to');
    source = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.95 });
  }
  // Browser applies EXIF once at decode; compressed canvas JPEG carries no EXIF.
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const result = await compress(bitmap);
    return { ...result, id: crypto.randomUUID(), orientation: orientation(result.width, result.height), rotation: 0, description: '' };
  } finally { bitmap.close(); }
}
export async function rotatePhoto(photo: ProcessedPhoto, delta: number): Promise<ProcessedPhoto> {
  const bitmap = await createImageBitmap(photo.blob);
  try {
    const result = await compress(bitmap, delta);
    return { ...photo, ...result, rotation: (photo.rotation + delta + 360) % 360, orientation: orientation(result.width, result.height) };
  } finally { bitmap.close(); }
}

export interface ConstructionPreview { attachment: PendingAttachment; pages: Blob[] }

// Fixed A4 portrait, sequential 2 x 3 slots. Preview and PDF use identical geometry.
// Embed the exact archive JPEG bytes in PDF; rasterize only Chinese text locally.
export async function buildConstructionAttachment(fields: Omit<ConstructionMetadata, 'photoCount' | 'photos'>,
  photos: ProcessedPhoto[]): Promise<ConstructionPreview> {
  if (photos.length < 1 || photos.length > 30) throw new Error('每份施工照片紀錄須有 1～30 張照片。');
  if (!fields.constructionDate) throw new Error('請填寫施工日期。');
  if (fields.projectName.length > 100 || fields.location.length > 100 || fields.workDescription.length > 300 || photos.some(p => p.description.length > 120)) {
    throw new Error('文字超出排版上限，請縮短後重試。');
  }
  await document.fonts.ready;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const W = 1190, H = 1683, margin = 56, gap = 24;
  const mm = (px: number) => px * 210 / W;
  const pages: Blob[] = [];
  const count = Math.ceil(photos.length / 6);
  for (let page = 0; page < count; page++) {
    if (page) pdf.addPage();
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#172033'; ctx.textBaseline = 'top';
    ctx.font = 'bold 36px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText('施工照片紀錄', margin, 44);
    ctx.font = '22px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    const wrap = (text: string, x: number, y: number, width: number, lineHeight = 28) => {
      let line = '';
      for (const char of text) {
        if (char === '\n' || ctx.measureText(line + char).width > width) {
          ctx.fillText(line, x, y); y += lineHeight; line = char === '\n' ? '' : char;
        } else line += char;
      }
      ctx.fillText(line, x, y); return y + lineHeight;
    };
    let y = wrap(`工程／專案名稱：${fields.projectName.replace(/\s+/g, ' ')}`, margin, 105, W - margin * 2);
    y = wrap(`施工日期：${fields.constructionDate}`, margin, y + 6, W - margin * 2);
    if (page === 0) {
      y = wrap(`施工地點：${fields.location.replace(/\s+/g, ' ')}`, margin, y + 6, W - margin * 2);
      y = wrap(`工作說明：${fields.workDescription.replace(/\s+/g, ' ')}`, margin, y + 6, W - margin * 2);
    }
    const top = Math.max(page === 0 ? 450 : 250, y + 20);
    const cellW = (W - 2 * margin - gap) / 2;
    const cellH = (H - top - 75 - 2 * gap) / 3;
    const placements: { photo: ProcessedPhoto; rect: ReturnType<typeof contain> }[] = [];
    photos.slice(page * 6, page * 6 + 6).forEach((photo, slot) => {
      const x = margin + (slot % 2) * (cellW + gap), rowY = top + Math.floor(slot / 2) * (cellH + gap);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.strokeRect(x, rowY, cellW, cellH);
      const rect = contain(photo.width, photo.height, x + 8, rowY + 8, cellW - 16, cellH - 126);
      placements.push({ photo, rect });
      ctx.font = 'bold 21px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
      ctx.fillText(`照片 ${String(page * 6 + slot + 1).padStart(2, '0')}`, x + 10, rowY + cellH - 108);
      ctx.font = '16px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
      wrap(photo.description.replace(/\s+/g, ' '), x + 10, rowY + cellH - 80, cellW - 20, 20);
    });
    ctx.font = '20px sans-serif'; ctx.fillText(`${page + 1} / ${count}`, W - 115, H - 45);
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
    for (const { photo, rect } of placements) {
      const bytes = new Uint8Array(await photo.blob.arrayBuffer());
      pdf.addImage(bytes, 'JPEG', mm(rect.x), mm(rect.y), mm(rect.width), mm(rect.height));
      const bitmap = await createImageBitmap(photo.blob);
      ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height); bitmap.close();
    }
    pages.push(await canvasBlob(canvas, 0.9)); canvas.width = canvas.height = 0;
  }
  const displayName = `施工照片紀錄_${fields.constructionDate.replace(/-/g, '')}.pdf`;
  const blob = pdf.output('blob');
  if (blob.size > 40 * 1024 * 1024) throw new Error('照片紀錄 PDF 超過 40 MB，請減少照片後重試。');
  return { pages, attachment: { attachmentId: `ATT-${crypto.randomUUID()}`, type: 'construction', displayName,
    metadata: { ...fields, photoCount: photos.length, photos: photos.map((p, i) => ({ sequence: i + 1,
      description: p.description, orientation: p.orientation, rotation: p.rotation, archivedFileName: `${String(i + 1).padStart(3, '0')}.jpg` })) },
    files: [{ key: 'primary', fileName: displayName, blob }, ...photos.map((p, i) => ({ key: `photo-${i + 1}`, fileName: `${String(i + 1).padStart(3, '0')}.jpg`, blob: p.blob }))],
    status: 'pending' } };
}
