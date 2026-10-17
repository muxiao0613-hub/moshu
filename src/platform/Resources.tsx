import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Folder, Project, Resource, ResourceKind, ResourceQuery } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { folderLabel, loadFolders, loadProjects } from '../shared/lib/catalog';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { ResourceDetail } from './ResourceDetail';
import { Folders } from './Folders';
import { DocumentSessions } from './DocumentSessions';
import {ModuleLibrary,LibraryReader} from './ModuleLibrary';
import type {LibraryEntry,ReadLibrary,SearchHit} from '../contracts';
import {useFileDropRefresh} from '../shared/lib/file-drop-refresh';

const kindLabel = { file: '文件', link: '链接', note: '笔记' };
export function Resources({ initialId, onSelected, projectId = null, onOpenDocument, onOpenNote, onCreateNote, onChanged, initialLibrary, onLibrarySelected, onOpenModule }: {
  initialLibrary?:ReadLibrary|null; onLibrarySelected?:(target:ReadLibrary|null)=>void; onOpenModule?:(hit:SearchHit)=>Promise<void>;
  initialId?:string|null; onSelected?:(id:string|null)=>void;
  onOpenDocument?: (id: string) => Promise<void>;
  projectId?: string | null; onOpenNote: (id: string) => Promise<void>;
  onCreateNote: (projectId: string | null) => Promise<void>; onChanged: () => Promise<void>;
}) {
  const [libraryTarget,setLibraryTarget]=useState<ReadLibrary|null>(initialLibrary??null);
  function selectLibrary(target:ReadLibrary|null){setLibraryTarget(target);onLibrarySelected?.(target);}
  function openLibrary(entry:LibraryEntry){selectLibrary({moduleId:entry.moduleId,kind:entry.kind,id:entry.id,sectionId:null});setSelected(null);onSelected?.(null);}
  const [resources, setResources] = useState<Resource[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]); const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  useEffect(()=>{if(initialId){void command('get_resource',{id:initialId}).then(setSelected).catch(e=>setError(asAppError(e)));}},[initialId]);
  useEffect(()=>{if(selected)onSelected?.(selected.id);},[selected,onSelected]);
  const [keyword, setKeyword] = useState(''); const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ResourceKind | 'module' | ''>(''); const [folder, setFolder] = useState('all');
  const [favorite, setFavorite] = useState(false); const [tag, setTag] = useState('');
  const [offset, setOffset] = useState(0); const [linkExisting, setLinkExisting] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const running = useRef(false);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [linkForm, setLinkForm] = useState(false); const [linkName, setLinkName] = useState(''); const [linkUrl, setLinkUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState(''); const [linkSource, setLinkSource] = useState('');
  const [notice, setNotice] = useState('');
  const [documentForm, setDocumentForm] = useState(false); const [documentName, setDocumentName] = useState('');
  const [documentFormat, setDocumentFormat] = useState<'md' | 'docx' | 'xlsx' | 'csv' | 'tsv'>('md');
  useEffect(() => { const timer = setTimeout(() => { setSearch(keyword); setOffset(0); }, 250); return () => clearTimeout(timer); }, [keyword]);
  const query = useMemo<ResourceQuery>(() => ({ offset, limit: 20, keyword: search, kind: kind === 'module' ? null : kind || null, folderId: folder === 'all' || folder === 'root' ? null : folder, rootOnly: folder === 'root', projectId: projectId && !linkExisting ? projectId : filterProject || null, favoriteOnly: favorite, tag: tag.trim() || null }), [offset, search, kind, folder, projectId, linkExisting, filterProject, favorite, tag]);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current; setLoading(true);
    try {
      const [nextFolders, nextProjects] = await Promise.all([loadFolders(), loadProjects()]);
      if (current !== generation.current) return;
      if (query.folderId && !nextFolders.some(folder => folder.id === query.folderId)) {
        setFolder('all'); setOffset(0); setNotice('文件夹已删除，已返回所有资料。'); return;
      }
      if (!projectId && query.projectId && !nextProjects.some(project => project.id === query.projectId)) {
        setFilterProject(''); setOffset(0); setNotice('项目已删除，已返回所有资料。'); return;
      }
      const rows = await command('list_resources', query);
      if (current === generation.current) { setResources(rows); setFolders(nextFolders); setProjects(nextProjects); setError(null); }
    } catch (error) { if (current === generation.current) setError(asAppError(error)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [query, projectId]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  async function changed() { await reload(); await onChanged(); }
  useFileDropRefresh(changed,setError);
  async function action(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setNotice('');
    try { await work(); await changed(); }
    catch (error) { const value = asAppError(error); if (value.code !== 'CANCELLED') setError(value); }
    finally { setBusy(false); running.current = false; }
  }
  if(libraryTarget)return <LibraryReader target={libraryTarget} onTarget={selectLibrary} onBack={()=>selectLibrary(null)} onEdit={onOpenModule}/>;
  const showLibrary=(!kind||kind==='module')&&!projectId&&!filterProject&&!favorite&&!tag.trim()&&(folder==='all'||folder==='root');
  return <section>
    <div className="page-heading"><div>{!projectId && <p className="eyebrow">收集、整理、连接</p>}<h1>{projectId ? '项目资料' : '资料库'}</h1><p className="muted">文件、链接、笔记与小说集中查看；墨稿作品自动收录，保存后可在这里阅读。</p></div></div>
    <div className="card-actions resource-actions">
      <button className="primary" disabled={busy} onClick={() => { void action(async () => {
        const resource = await command('import_file', { folderId: query.folderId, projectId }); setSelected(resource); setNotice('文件已复制到托管目录并通过哈希校验。');
      }); }}>{busy ? '正在处理…' : '导入文件'}</button>
      <button disabled={busy} onClick={() => setDocumentForm(!documentForm)}>{documentForm ? '收起新建文档' : '新建文档'}</button>
      <button disabled={busy} onClick={() => setLinkForm(!linkForm)}>{linkForm ? '收起链接表单' : '添加链接'}</button>
      <button disabled={busy} onClick={() => { void onCreateNote(projectId); }}>新建笔记</button>
      {projectId && <button disabled={busy} className={linkExisting ? 'selected' : ''} onClick={() => { setLinkExisting(!linkExisting); setOffset(0); }}>{linkExisting ? '返回项目资料' : '关联已有资料'}</button>}
    </div>
    <p className="metadata">单份文件上限 100 MB；Markdown 可直接编辑；Word、Excel 支持 Office 编辑与版本回收；阅读支持 MD、DOCX、XLSX、CSV/TSV（20 MiB 内），UTF-8 文本（2 MiB 内）与常见图片（10 MiB 内）预览。</p>
    <ErrorMessage error={error} retry={() => { void reload(); }} />
    {notice && <p className="success-message" role="status">{notice}</p>}
    {linkForm && <form className="create-project" onSubmit={e => { e.preventDefault(); void action(async () => {
      const resource = await command('create_link', { name: linkName, url: linkUrl, description: linkDescription, source: linkSource, folderId: query.folderId, projectId });
      setSelected(resource); setLinkName(''); setLinkUrl(''); setLinkDescription(''); setLinkSource(''); setLinkForm(false);
    }); }}><fieldset disabled={busy} className="form-grid two-columns"><label>名称<input required maxLength={200} value={linkName} onChange={e => setLinkName(e.target.value)} /></label><label>网址<input required type="url" value={linkUrl} maxLength={2048} onChange={e => setLinkUrl(e.target.value)} placeholder="https://" /></label><label>说明<textarea maxLength={8192} value={linkDescription} onChange={e => setLinkDescription(e.target.value)} /></label><label>来源<textarea maxLength={8192} value={linkSource} onChange={e => setLinkSource(e.target.value)} /></label><button className="primary" type="submit">保存链接</button></fieldset></form>}
    {documentForm && <form className="create-project" onSubmit={event => { event.preventDefault(); void action(async () => {
      const created = await command('create_document', {name:documentName,format:documentFormat,folderId:query.folderId,projectId});
      setDocumentForm(false); setDocumentName(''); setSelected(created); if (onOpenDocument) await onOpenDocument(created.id);
    }); }}><fieldset className="form-grid two-columns" disabled={busy}><label>文档名称<input required maxLength={180} value={documentName} onChange={event => setDocumentName(event.target.value)} /></label><label>文件格式<select value={documentFormat} onChange={event => setDocumentFormat(event.target.value as typeof documentFormat)}><option value="md">Markdown (.md)</option><option value="docx">Word (.docx)</option><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option><option value="tsv">TSV (.tsv)</option></select></label><button className="primary" type="submit">创建并编辑</button></fieldset></form>}
    {!projectId && onOpenDocument && <DocumentSessions onOpen={onOpenDocument} onChanged={changed} />}
    <Folders folders={folders} reload={changed} />
    <div className="filter-bar">
      <label>关键字<input maxLength={200} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="筛选名称、说明、来源或 URL" /></label>
      <label>类型<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setOffset(0); }}><option value="">所有类型</option><option value="file">文件</option><option value="link">链接</option><option value="note">笔记</option><option value="module">小说作品</option></select></label>
      <label>文件夹<select value={folder} onChange={e => { setFolder(e.target.value); setOffset(0); }}><option value="all">所有文件夹</option><option value="root">根目录</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder, folders)}</option>)}</select></label>
      {!projectId && <label>项目<select value={filterProject} onChange={e => { setFilterProject(e.target.value); setOffset(0); }}><option value="">所有项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      <label>标签<input maxLength={40} value={tag} onChange={e => { setTag(e.target.value); setOffset(0); }} placeholder="精确标签" /></label>
      <label className="check-label"><input type="checkbox" checked={favorite} onChange={e => { setFavorite(e.target.checked); setOffset(0); }} />只看收藏</label>
    </div>
    {showLibrary&&<ModuleLibrary showEmpty={kind==='module'} keyword={search} onSelect={openLibrary}/>}
    {kind==='module'&&!showLibrary&&<p className="empty-state">小说作品未分配文件夹、项目、标签或收藏，请清除这些筛选后查看。</p>}
    {kind!=='module'&&<div className={selected ? 'resources-layout' : ''}><div>
      {loading ? <p role="status">正在读取资料…</p> : resources.length ? <div className="resource-list">{resources.map(resource => <article key={resource.id} className={selected?.id === resource.id ? 'resource-row selected' : 'resource-row'}>
        <button className="resource-main" disabled={busy} onClick={() => setSelected(resource)}><span className="type-badge">{kindLabel[resource.kind]}</span><strong>{resource.name}{resource.favorite ? ' ☆' : ''}</strong><small>{resource.tags.join(' · ') || resource.description || resource.source || new Date(resource.updatedAt).toLocaleString()}</small></button>
        {projectId && linkExisting && (resource.projectIds.includes(projectId) ? <span className="metadata">已关联</span> : <button disabled={busy} onClick={() => { void action(async () => { await command('set_resource_project', { id: resource.id, baseRevision: resource.revision, projectId, linked: true }); setNotice('资料已关联到项目。'); }); }}>关联</button>)}
      </article>)}</div> : <div className="empty-state">{search || kind || tag || favorite ? '没有符合筛选条件的资料。' : '还没有文件、链接或笔记。可导入文件或添加链接。'}</div>}
      <div className="pagination"><button disabled={loading || busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</button><span>第 {offset / 20 + 1} 页 · 按更新时间排序</span><button disabled={loading || busy || resources.length < 20} onClick={() => setOffset(offset + 20)}>下一页</button></div>
    </div>{selected && <ResourceDetail key={selected.id} initial={selected} folders={folders} projects={projects} onChanged={changed} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} onClose={() => {setSelected(null);onSelected?.(null);}} />}</div>}
  </section>;
}
