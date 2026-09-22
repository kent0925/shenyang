import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Edit2, FolderTree, Loader2, Plus, Search } from 'lucide-react';
import { backendStorageService } from '../../services/backendStorage';
import type { Project, SubProject } from '../../models/backend';

export const SubProjectsPanel: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<SubProject[]>([]);
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<SubProject | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ projectId: '', subProjectName: '', status: 'active' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [projectList, subList] = await Promise.all([
        backendStorageService.listProjects(),
        backendStorageService.listSubProjects(),
      ]);
      setProjects(projectList); setItems(subList);
    } catch { setError('載入分案資料失敗，請稍後再試。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const projectNames = useMemo(() => new Map(projects.map((p) => [p.projectId, p.projectName])), [projects]);
  const filtered = useMemo(() => items.filter((item) => {
    const text = `${item.subProjectId} ${item.subProjectName} ${projectNames.get(item.projectId) || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!projectFilter || item.projectId === projectFilter) && (!statusFilter || item.status === statusFilter);
  }), [items, projectNames, projectFilter, query, statusFilter]);

  const openCreate = () => { setEditing(null); setForm({ projectId: projectFilter, subProjectName: '', status: 'active' }); setError(null); setModalOpen(true); };
  const openEdit = (item: SubProject) => { setEditing(item); setForm({ projectId: item.projectId, subProjectName: item.subProjectName, status: item.status || 'active' }); setError(null); setModalOpen(true); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!form.projectId || !form.subProjectName.trim()) { setError('請選擇專案並填寫分案名稱。'); return; }
    setSaving(true); setError(null);
    try {
      const saved = await backendStorageService.saveSubProject({ ...form, subProjectName: form.subProjectName.trim(), subProjectId: editing?.subProjectId });
      setItems((prev) => editing ? prev.map((x) => x.subProjectId === saved.subProjectId ? saved : x) : [saved, ...prev]);
      setEditing(null); setModalOpen(false); setSuccess('分案已儲存。'); setTimeout(() => setSuccess(null), 2500);
    } catch (err: any) { setError(err?.safeMessage || err?.message || '儲存分案失敗，請確認專案關聯。'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-4">
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" /><input className="w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-lg text-sm" placeholder="搜尋分案編號、名稱或專案..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <select className="px-3 py-2 border rounded-lg text-sm" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="">全部專案</option>{projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}</option>)}</select>
      <select className="px-3 py-2 border rounded-lg text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">全部狀態</option><option value="active">進行中</option><option value="closed">已結案</option></select>
      <button type="button" onClick={openCreate} className="flex items-center justify-center gap-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold"><Plus className="w-4 h-4" />新增分案</button>
    </div>
    {success && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex gap-2"><CheckCircle2 className="w-4 h-4" />{success}</div>}
    {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {loading ? <div className="p-12 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> : <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">分案編號</th><th className="p-3">主專案</th><th className="p-3">分案名稱</th><th className="p-3">狀態</th><th className="p-3">操作</th></tr></thead><tbody className="divide-y">{filtered.map((item) => <tr key={item.subProjectId}><td className="p-3 font-mono text-xs">{item.subProjectId}</td><td className="p-3">{projectNames.get(item.projectId) || item.projectId}</td><td className="p-3 font-medium">{item.subProjectName}</td><td className="p-3">{item.status === 'active' ? '進行中' : '已結案'}</td><td className="p-3"><button type="button" onClick={() => openEdit(item)} className="inline-flex items-center gap-1 text-blue-700"><Edit2 className="w-3.5 h-3.5" />編輯</button></td></tr>)}</tbody></table>}
    </div>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={save} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"><h3 className="font-bold flex gap-2"><FolderTree className="w-5 h-5 text-blue-600" />{editing ? '編輯分案' : '新增分案'}</h3><select className="w-full p-2 border rounded-lg" value={form.projectId} disabled={!!editing || saving} onChange={(e) => setForm({ ...form, projectId: e.target.value })}><option value="">請選擇主專案</option>{projects.filter((p) => editing || p.status === 'active').map((p) => <option key={p.projectId} value={p.projectId}>{p.projectName}（{p.company}）</option>)}</select><input className="w-full p-2 border rounded-lg" placeholder="分案名稱" value={form.subProjectName} disabled={saving} onChange={(e) => setForm({ ...form, subProjectName: e.target.value })} /><select className="w-full p-2 border rounded-lg" value={form.status} disabled={saving} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">進行中</option><option value="closed">已結案</option></select><p className="text-xs text-slate-500">分案即使尚有未使用預算，仍可正常結案。</p><div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setModalOpen(false); setForm({ projectId: '', subProjectName: '', status: 'active' }); }}>取消</button><button type="submit" disabled={saving} className="px-4 py-2 bg-blue-700 text-white rounded-lg">儲存</button></div></form></div>}
  </div>;
};
