import { useEffect, useState } from 'react';
import type { FormAttachment, PendingAttachment, PendingAttachmentRetry } from '../../models/attachments';
import { ATTACHMENT_PARTIAL_FAILURE, downloadAttachment, generalAttachment, listFormAttachments } from '../../services/formAttachments';
import { downloadBlob } from '../../utils/fileBlob';
import { ConstructionPhotoBuilder } from './ConstructionPhotoBuilder';

export function ArchivedAttachments({ formId, version, refresh = 0 }: { formId: string; version: number; refresh?: number }) {
  const [items, setItems] = useState<FormAttachment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true; setItems([]); setError(''); setLoading(true);
    listFormAttachments(formId, version).then(result => { if (current) setItems(result); })
      .catch(e => { if (current) setError(e.message || '無法讀取附件。'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [formId, version, refresh, reload]);
  return <div className="space-y-2 text-sm">
    {loading && <p role="status">正在讀取已歸檔附件…</p>}
    {error && <p role="alert" className="text-red-700">{error} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>重新讀取</button></p>}
    {!loading && !error && !items.length && <p className="text-slate-500">此版本尚無已歸檔附件。</p>}
    {items.map(item => <div key={item.attachmentId} className="border rounded-lg p-3 flex justify-between gap-3 items-center">
      <div className="min-w-0"><p className="break-all font-medium">{item.displayName}</p>
        <p className="text-xs text-slate-500">{item.type === 'construction' ? `施工照片 · ${item.metadata?.photoCount} 張 · ${item.metadata?.constructionDate}` : '一般附件'} · v{item.addedVersion} 加入</p></div>
      <button type="button" className="text-blue-700 underline shrink-0 disabled:opacity-50" disabled={!!downloading} onClick={async () => {
        setDownloading(item.attachmentId); setError('');
        try { const result = await downloadAttachment(formId, version, item.attachmentId); downloadBlob(result.blob, result.fileName); }
        catch (e) { setError(e instanceof Error ? e.message : '附件下載失敗。'); } finally { setDownloading(''); }
      }}>{downloading === item.attachmentId ? '下載中…' : item.type === 'construction' ? '下載 PDF' : '下載'}</button>
    </div>)}
  </div>;
}

export function AttachmentSection({ formId, version, projectName, date, pending, onChange, retry, onRetry, busy, refresh }: {
  formId: string | null; version: number | null; projectName: string; date: string;
  pending: PendingAttachment[]; onChange: (items: PendingAttachment[]) => void;
  retry: PendingAttachmentRetry | null; onRetry: () => void; busy: boolean; refresh: number;
}) {
  const [builder, setBuilder] = useState(false);
  const [error, setError] = useState('');
  return <section aria-label="附件" className="mt-8 border-t pt-6 space-y-3">
    <h2 className="font-bold text-slate-800">附件</h2>
    <fieldset disabled={busy || builder} className="flex flex-wrap gap-3">
      <label className="border rounded-lg px-3 py-2 text-sm cursor-pointer">＋ 一般附件
        <input aria-label="一般附件" type="file" className="block text-xs mt-1 max-w-full" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.xlsm" onChange={e => {
          const files = Array.from(e.target.files || []); e.target.value = ''; setError('');
          try { onChange([...pending, ...files.map(generalAttachment)]); } catch (err) { setError(err instanceof Error ? err.message : '附件格式不正確。'); }
        }} />
      </label>
      <button type="button" className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50" onClick={() => setBuilder(true)}>＋ 施工照片紀錄</button>
    </fieldset>
    <p className="text-xs text-slate-500">一般附件單檔上限 10 MB；待存檔附件暫存在此分頁，重新整理會遺失。</p>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {pending.map(item => <div key={item.attachmentId} className="border rounded-lg p-3 flex justify-between gap-3 text-sm">
      <div className="min-w-0"><p className="font-medium break-all">{item.displayName}</p>
        <p className="text-slate-500">{item.type === 'construction' ? `施工照片紀錄 · ${item.metadata?.photoCount} 張照片` : '一般附件'} · {(item.files.reduce((sum, f) => sum + f.blob.size, 0) / 1024 / 1024).toFixed(2)} MB · {item.status === 'pending' ? '待存檔' : item.status === 'uploading' ? '上傳中' : '上傳失敗'}</p>
        {item.error && <p role="alert" className="text-red-700">{item.error}</p>}</div>
      <button type="button" className="underline shrink-0 disabled:opacity-50" disabled={busy || item.status !== 'pending'} onClick={() => onChange(pending.filter(a => a.attachmentId !== item.attachmentId))}>移除</button>
    </div>)}
    {retry && retry.attachments.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm space-y-2">
      <p role="status">{ATTACHMENT_PARTIAL_FAILURE}</p>
      <button type="button" disabled={busy} className="border rounded-lg bg-white px-3 py-2 disabled:opacity-50" onClick={onRetry}>重試附件</button>
    </div>}
    {formId && version && <ArchivedAttachments formId={formId} version={version} refresh={refresh} />}
    {builder && <ConstructionPhotoBuilder projectName={projectName} date={date} onClose={() => setBuilder(false)} onAdd={item => { onChange([...pending, item]); setBuilder(false); }} />}
  </section>;
}
