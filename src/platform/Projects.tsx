import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectStatus } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { ProjectCover } from './ProjectCover';
import { ProjectDetail } from './ProjectDetail';

export function Projects({ initialId, onSelected, reload: reloadApp, onCreateNote, onOpenNote, onOpenTasks, onOpenDocument }: { initialId?:string|null; onSelected?:(id:string|null)=>void; reload: () => Promise<void>; onCreateNote: (projectId: string | null) => Promise<void>; onOpenNote: (id: string) => Promise<void>; onOpenDocument?: (id: string) => Promise<void>; onOpenTasks?: (id: string) => Promise<void> }) {
  const [projects, setProjects] = useState<Project[]>([]); const [selected, setSelected] = useState<Project | null>(null);
  useEffect(()=>{if(initialId){void command('get_project',{id:initialId}).then(setSelected).catch(e=>setError(asAppError(e)));}},[initialId]);
  useEffect(()=>{if(selected)onSelected?.(selected.id);},[selected,onSelected]);
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [keyword, setKeyword] = useState(''); const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>(''); const [tag, setTag] = useState(''); const [favorite, setFavorite] = useState(false);
  const [offset, setOffset] = useState(0); const [view, setView] = useState<'cards' | 'list'>('cards');
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [busy, setBusy] = useState(false); const running = useRef(false); const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  useEffect(() => { const timer = setTimeout(() => { setSearch(keyword); setOffset(0); }, 250); return () => clearTimeout(timer); }, [keyword]);
  const query = useMemo(() => ({ offset, limit: 20, keyword: search, status: status || null, favoriteOnly: favorite, tag: tag.trim() || null }), [offset, search, status, favorite, tag]);
  const reload = useCallback(async () => {
    const current = ++generation.current; setLoading(true);
    try { const rows = await command('query_projects', query); if (current === generation.current) { setProjects(rows); setError(null); } }
    catch (error) { if (current === generation.current) setError(asAppError(error)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [query]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  async function changed() { await reload(); await reloadApp(); }
  async function action(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { await work(); await changed(); } catch (error) { setError(asAppError(error)); }
    finally { setBusy(false); running.current = false; }
  }
  if (selected) return <ProjectDetail key={selected.id} initial={selected} onChanged={changed} onCreateNote={onCreateNote} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} onOpenTasks={onOpenTasks} onClose={() => {setSelected(null);onSelected?.(null);}} />;
  return <section>
    <div className="page-heading"><div><p className="eyebrow">把事情组织起来</p><h1>项目</h1><p className="muted">为学习、工作和创作留一个清晰的入口。</p></div><button onClick={() => setView(view === 'cards' ? 'list' : 'cards')}>{view === 'cards' ? '切换列表' : '切换卡片'}</button></div>
    <form className="create-project" onSubmit={event => {
      event.preventDefault(); void action(async () => { const created = await command('create_project', { name, description }); setName(''); setDescription(''); setSelected(created); });
    }}><fieldset disabled={busy} className="form-grid two-columns">
      <label>项目名称<input value={name} onChange={event => setName(event.target.value)} maxLength={200} required placeholder="例如：秋季学习计划" /></label>
      <label>说明<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={8192} placeholder="你希望在这里完成什么？" /></label>
      <button className="primary" type="submit">创建项目</button>
    </fieldset></form>
    <ErrorMessage error={error} retry={() => { void reload(); }} />
    <div className="filter-bar"><label>关键字<input maxLength={200} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="名称或说明" /></label><label>状态<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setOffset(0); }}><option value="">全部</option><option value="active">进行中</option><option value="archived">已归档</option></select></label><label>标签<input value={tag} maxLength={40} onChange={e => { setTag(e.target.value); setOffset(0); }} placeholder="精确标签" /></label><label className="check-label"><input type="checkbox" checked={favorite} onChange={e => { setFavorite(e.target.checked); setOffset(0); }} />只看收藏</label></div>
    {loading ? <p role="status">正在读取项目…</p> : <div className={view === 'cards' ? 'project-grid' : 'project-grid project-list'}>{projects.map(project => <article className="project-card" key={project.id}>
      <ProjectCover project={project} />
      <span className="eyebrow">{project.status === 'active' ? '进行中' : '已归档'}{project.favorite ? ' · 收藏' : ''}</span>
      <h2>{project.name}</h2><p>{project.description || '添加资料和笔记，开始积累这个项目。'}</p><p className="tag-list">{project.tags.join(' · ')}</p>
      <div className="card-actions"><button className="primary" disabled={busy} onClick={() => setSelected(project)}>打开项目</button>
        <button disabled={busy} onClick={() => { void action(async () => { await command('update_project', { id: project.id, name: project.name, description: project.description, status: project.status === 'active' ? 'archived' : 'active', baseRevision: project.revision }); }); }}>{project.status === 'active' ? '归档' : '恢复进行中'}</button>
      </div>
    </article>)}</div>}
    {!loading && projects.length === 0 && <div className="empty-state">没有符合条件的项目。可以调整筛选，或创建新项目。</div>}
    <div className="pagination"><button disabled={loading || busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</button><span>第 {offset / 20 + 1} 页 · 按更新时间排序</span><button disabled={loading || busy || projects.length < 20} onClick={() => setOffset(offset + 20)}>下一页</button></div>
  </section>;
}
