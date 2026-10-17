import {useConfirmation} from '../shared/ui/Confirmation';
import { useEffect, useRef, useState } from 'react';
import type { FilePreview, Folder, Project, Resource } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { folderLabel, splitTags } from '../shared/lib/catalog';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { canEditDocument } from './DocumentEditor';
import { FileVersions } from './FileVersions';
import { DocumentPreview, canReadDocument } from './DocumentPreview';

export function ResourceDetail({ initial, folders, projects, onChanged, onOpenNote, onOpenDocument, onClose }: {
  onOpenDocument?: (id: string) => Promise<void>;
  initial: Resource; folders: Folder[]; projects: Project[];
  onChanged: () => Promise<void>; onOpenNote: (id: string) => Promise<void>; onClose: () => void;
}) {
  const {ask,dialog}=useConfirmation();
  const [resource, setResource] = useState(initial);
  const [name, setName] = useState(initial.name); const [description, setDescription] = useState(initial.description);
  const [source, setSource] = useState(initial.source); const [url, setUrl] = useState(initial.url ?? '');
  const [folder, setFolder] = useState(initial.folderId ?? ''); const [favorite, setFavorite] = useState(initial.favorite);
  const [tags, setTags] = useState(initial.tags.join('，'));
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewError, setPreviewError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [busy, setBusy] = useState(false); const running = useRef(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    if (initial.kind === 'file' && !canReadDocument(initial)) void command('preview_file', { id: initial.id }).then(value => { if (active) setPreview(value); })
      .catch(error => { if (active) setPreviewError(asAppError(error)); });
    return () => { active = false; };
  }, [initial.id, initial.kind]);
  async function action(work: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setNotice('');
    try { await work(); await onChanged(); }
    catch (error) { const value = asAppError(error); if (value.code !== 'CANCELLED') setError(value); }
    finally { running.current = false; setBusy(false); }
  }
  const deleted = resource.deletedAt !== null;
  return <section className="detail-panel" aria-label="资料详情">
    <div className="section-heading"><h2>资料详情</h2><button type="button" disabled={busy} onClick={onClose}>关闭详情</button></div>
    {dialog}
    <ErrorMessage error={error} />
    {!resource.deletedAt && canEditDocument(resource) && onOpenDocument && <div className="document-entry"><button className="primary" disabled={busy} onClick={() => { void action(async () => { await onOpenDocument(resource.id); }); }}>编辑文档</button><p className="metadata">Markdown 在墨枢内编辑；Word / Excel 使用本机 Office 编辑副本并提交版本。</p></div>}

    {!resource.deletedAt && resource.kind === 'file' && <FileVersions resource={resource} onRestored={async saved => {setResource(saved); await onChanged();}} />}
    {notice && <p role="status" className="success-message">{notice}</p>}
    {deleted ? <div className="empty-state"><p>已移入回收站，附件与项目关联仍保留。</p><button disabled={busy} onClick={() => { void action(async () => { setResource(await command('set_resource_deleted', { id: resource.id, baseRevision: resource.revision, deleted: false })); }); }}>撤销删除</button></div> : <>
      <form onSubmit={event => { event.preventDefault(); void action(async () => {
        const saved = await command('save_resource', { id: resource.id, baseRevision: resource.revision, name, description, source, folderId: folder || null, url: resource.kind === 'link' ? url : null, favorite, tags: splitTags(tags) });
        setResource(saved); setNotice('资料信息已保存。');
      }); }}>
        <fieldset disabled={busy} className="form-grid">
          <label>名称<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
          {resource.kind === 'link' && <label>链接<input required type="url" maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} /></label>}
          <label>说明<textarea value={description} maxLength={8192} onChange={e => setDescription(e.target.value)} /></label>
          <label>来源说明<textarea value={source} maxLength={8192} onChange={e => setSource(e.target.value)} placeholder="记录出处或采集背景" /></label>
          <label>文件夹<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">根目录</option>{folders.map(item => <option key={item.id} value={item.id}>{folderLabel(item, folders)}</option>)}</select></label>
          <label>标签<input maxLength={820} value={tags} onChange={e => setTags(e.target.value)} placeholder="用逗号分隔，最多 20 个" /></label>
          <label className="check-label"><input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)} />收藏资料</label>
          <button type="submit" className="primary">保存资料信息</button>
        </fieldset>
      </form>
      <div className="detail-section"><h3>关联项目</h3><p className="muted">移除关联只解除整理关系，保留资料本身。</p>
        <div className="association-list">{projects.map(project => <label className="check-label" key={project.id}><input type="checkbox" disabled={busy} checked={resource.projectIds.includes(project.id)} onChange={e => { const linked = e.target.checked; void action(async () => { setResource(await command('set_resource_project', { id: resource.id, baseRevision: resource.revision, projectId: project.id, linked })); }); }} />{project.name}{project.status === 'archived' ? ' · 已归档' : ''}</label>)}</div>
        {!projects.length && <p className="muted">先创建项目，再关联资料。</p>}
      </div>
      <div className="card-actions detail-section">
        {resource.kind === 'note' ? <button disabled={busy} onClick={() => { void action(() => onOpenNote(resource.id)); }}>打开笔记编辑器</button> : <button disabled={busy} onClick={() => { void action(() => command('open_resource', { id: resource.id })); }}>{resource.kind === 'link' ? '在系统浏览器打开' : '用系统应用打开'}</button>}
        {resource.kind === 'file' && <button disabled={busy} onClick={() => { void action(async () => { await command('export_file', { id: resource.id }); setNotice('文件副本已导出。'); }); }}>导出副本</button>}
        <button disabled={busy} onClick={() => { void ask('将这份资料移入回收站？项目中的关联也会暂时隐藏，其他资料保持可用。').then(confirmed=>{if(confirmed)void action(async () => { setResource(await command('set_resource_deleted', { id: resource.id, baseRevision: resource.revision, deleted: true })); });}); }}>移入回收站</button>
      </div>
      {resource.kind === 'file' && <div className="detail-section"><h3>文件预览</h3><p className="metadata">{resource.originalName} · {resource.size?.toLocaleString()} 字节 · {resource.mimeType}</p><p className="metadata hash">SHA-256：{resource.sha256}</p>
        {canReadDocument(resource) ? <DocumentPreview key={resource.id} resource={resource} /> : <>
        <ErrorMessage error={previewError} retry={() => { setPreviewError(null); void command('preview_file', { id: resource.id }).then(setPreview).catch(error => setPreviewError(asAppError(error))); }} />
        {preview?.kind === 'text' ? <pre className="text-preview">{preview.text}</pre> : preview?.kind === 'image' && preview.dataUrl ? <img className="file-preview" src={preview.dataUrl} alt={resource.name} /> : preview?.message ? <p className="muted">{preview.message}</p> : !previewError && <p role="status">正在校验并加载预览…</p>}
        </>}
      </div>}
    </>}
  </section>;
}
