import { useEffect, useRef, useState } from 'react';
import type { PendingAttachment, ProcessedPhoto } from '../../models/attachments';
import { buildConstructionAttachment, importPhoto, reorderPhotos, rotatePhoto } from '../../services/constructionPhotos';
import type { ConstructionPreview } from '../../services/constructionPhotos';

export function BlobImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return <img src={url || undefined} alt={alt} className={className} />;
}
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40';

export function ConstructionPhotoBuilder({ projectName, date, onAdd, onClose }: {
  projectName: string; date: string; onAdd: (attachment: PendingAttachment) => void; onClose: () => void;
}) {
  const [fields, setFields] = useState({ projectName, constructionDate: date, location: '', workDescription: '' });
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ConstructionPreview | null>(null);
  const dragId = useRef<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  const change = (next: ProcessedPhoto[]) => { setPhotos(next); setPreview(null); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '照片處理失敗。'); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 bg-slate-900/50 p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="施工照片紀錄">
    <div className="mx-auto max-w-4xl rounded-2xl bg-white p-4 sm:p-6 space-y-4">
      <div className="flex justify-between items-center"><h2 className="text-lg font-bold">施工照片紀錄</h2>
        <button ref={closeRef} type="button" className={button} disabled={busy} onClick={onClose}>關閉</button></div>
      <p className="text-sm text-slate-500">最多 30 張。照片會在此裝置轉為壓縮 JPEG，存檔後才上傳。</p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">工程／專案名稱<input className="block w-full border rounded-lg p-2" maxLength={100} value={fields.projectName} onChange={e => { setFields({ ...fields, projectName: e.target.value }); setPreview(null); }} /></label>
          <label className="text-sm">施工日期<input type="date" className="block w-full border rounded-lg p-2" value={fields.constructionDate} onChange={e => { setFields({ ...fields, constructionDate: e.target.value }); setPreview(null); }} /></label>
          <label className="text-sm sm:col-span-2">施工地點<input className="block w-full border rounded-lg p-2" maxLength={100} value={fields.location} onChange={e => { setFields({ ...fields, location: e.target.value }); setPreview(null); }} /></label>
          <label className="text-sm sm:col-span-2">工作說明<textarea rows={3} className="block w-full border rounded-lg p-2" maxLength={300} value={fields.workDescription} onChange={e => { setFields({ ...fields, workDescription: e.target.value }); setPreview(null); }} /></label>
        </div>
        <label className="block text-sm font-semibold">匯入照片（{photos.length} / 30）
          <input aria-label="匯入照片" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.heif" className="block mt-2 max-w-full" onChange={e => {
            const files = Array.from(e.target.files || []); e.target.value = '';
            void run(async () => {
              if (photos.length + files.length > 30) throw new Error('每份最多 30 張照片。');
              const next = [...photos];
              // Sequential conversion bounds memory and preserves construction order.
              for (const file of files) { next.push(await importPhoto(file)); change([...next]); }
            });
          }} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">{photos.map((photo, index) => <div key={photo.id} className="border rounded-xl p-3 space-y-2" draggable={!busy}
          onDragStart={() => { dragId.current = photo.id; }} onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (!busy) change(reorderPhotos(photos, photos.findIndex(p => p.id === dragId.current), index)); dragId.current = null; }}>
          <BlobImage blob={photo.blob} alt={`照片 ${index + 1}`} className="h-40 w-full object-contain bg-slate-50" />
          <p className="text-sm font-semibold">照片 {String(index + 1).padStart(2, '0')} · {photo.orientation === 'portrait' ? '直拍' : photo.orientation === 'landscape' ? '橫拍' : '方形'} · {(photo.blob.size / 1024 / 1024).toFixed(2)} MB</p>
          <label className="block text-sm">照片說明<textarea maxLength={120} rows={2} className="block w-full border rounded p-2" value={photo.description} onChange={e => change(photos.map(p => p.id === photo.id ? { ...p, description: e.target.value } : p))} /></label>
          <div className="flex flex-wrap gap-1">
            {([-90, 90] as const).map(delta => <button type="button" className={button} key={delta} onClick={() => void run(async () => { const rotated = await rotatePhoto(photo, delta); change(photos.map(p => p.id === photo.id ? rotated : p)); })}>{delta < 0 ? '左轉 90°' : '右轉 90°'}</button>)}
            <button type="button" className={button} disabled={index === 0} onClick={() => change(reorderPhotos(photos, index, index - 1))}>上移</button>
            <button type="button" className={button} disabled={index === photos.length - 1} onClick={() => change(reorderPhotos(photos, index, index + 1))}>下移</button>
            <button type="button" className={button} onClick={() => change(photos.filter(p => p.id !== photo.id))}>移除</button>
          </div>
        </div>)}</div>
        <button type="button" className={button} disabled={!photos.length} onClick={() => void run(async () => setPreview(await buildConstructionAttachment(fields, photos)))}>預覽</button>
      </fieldset>
      {busy && <p role="status">正在處理照片，請稍候…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {preview && <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">最終 PDF 排版 · {preview.pages.length} 頁</h3>
        {preview.pages.map((page, i) => <BlobImage key={i} blob={page} alt={`PDF 第 ${i + 1} 頁`} className="w-full border shadow-sm" />)}
        <button type="button" disabled={busy} className="bg-blue-700 text-white px-5 py-2 rounded-lg" onClick={() => onAdd(preview.attachment)}>加入附件</button>
      </div>}
    </div>
  </div>;
}
