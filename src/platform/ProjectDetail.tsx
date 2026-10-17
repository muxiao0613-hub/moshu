import {useConfirmation} from '../shared/ui/Confirmation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, Resource } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { splitTags } from '../shared/lib/catalog';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { ProjectCover } from './ProjectCover';
import { ProjectTasks } from './ProjectTasks';
import { Resources } from './Resources';

export function ProjectDetail({ initial, onChanged, onOpenNote, onCreateNote, onOpenTasks, onOpenDocument, onClose }: {
  initial: Project; onChanged: () => Promise<void>; onOpenNote: (id: string) => Promise<void>;
  onOpenDocument?: (id: string) => Promise<void>; onOpenTasks?: (id: string) => Promise<void>;
  onCreateNote: (id: string | null) => Promise<void>; onClose: () => void;
}) {
  const {ask,dialog}=useConfirmation();
  const [project, setProject] = useState(initial);
  const [name, setName] = useState(initial.name); const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status); const [favorite, setFavorite] = useState(initial.favorite);
  const [tags, setTags] = useState(initial.tags.join('，')); const [cover, setCover] = useState('keep');
  const [images, setImages] = useState<Resource[]>([]);
  const [busy, setBusy] = useState(false); const running = useRef(false);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [notice, setNotice] = useState('');
  const imageGeneration = useRef(0);
  const refreshImages = useCallback(async () => {
      const generation = ++imageGeneration.current;
      const result: Resource[] = [];
      for (let offset = 0; offset <= 1_000_000; offset += 100) {
        const page = await command('list_resources', { offset, limit: 100, keyword: '', kind: 'file', folderId: null, rootOnly: false, projectId: null, favoriteOnly: false, tag: null });
        result.push(...page.filter(item => item.mimeType?.startsWith('image/')));
        if (page.length < 100) break;
      }
      if (generation === imageGeneration.current) setImages(result);
  }, []);
  useEffect(() => {
    void refreshImages().catch(error => setError(asAppError(error)));
    return () => { imageGeneration.current++; };
  }, [refreshImages]);
  async function action(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setNotice('');
    try { await work(); await onChanged(); }
    catch (error) { setError(asAppError(error)); }
    finally { running.current = false; setBusy(false); }
  }
  return <section>
    <div className="page-heading"><div><p className="eyebrow">项目详情 · {project.status === 'active' ? '进行中' : '已归档'}</p><h1>{project.name}</h1></div><button disabled={busy} onClick={onClose}>返回项目列表</button></div>
    {dialog}
    <ErrorMessage error={error} />{notice && <p className="success-message" role="status">{notice}</p>}
    {project.deletedAt ? <div className="empty-state"><p>项目已移入回收站，共享资料保持可用。</p><button disabled={busy} onClick={() => { void action(async () => { setProject(await command('set_project_deleted', { id: project.id, baseRevision: project.revision, deleted: false })); }); }}>撤销删除并恢复关联</button></div> : <>
      <div className="project-detail-header"><ProjectCover key={project.coverBlobId} project={project} />
        <form className="create-project" onSubmit={e => { e.preventDefault(); void action(async () => {
          const saved = await command('save_project_details', { id: project.id, baseRevision: project.revision, name, description, status, favorite, tags: splitTags(tags), changeCover: cover !== 'keep', coverResourceId: cover === 'keep' || cover === 'none' ? null : cover });
          setProject(saved); setCover('keep'); setNotice('项目已保存。');
        }); }}><fieldset disabled={busy} className="form-grid two-columns"><label>项目名称<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label><label>状态<select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="active">进行中</option><option value="archived">已归档</option></select></label><label>说明<textarea maxLength={8192} value={description} onChange={e => setDescription(e.target.value)} /></label><label>标签<input maxLength={820} value={tags} onChange={e => setTags(e.target.value)} placeholder="用逗号分隔" /></label>
          <label>封面<select value={cover} onChange={e => setCover(e.target.value)}><option value="keep">保留当前封面</option><option value="none">无封面</option>{images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}</select><small className="muted">从资料库已导入的图片中选择。</small></label><label className="check-label"><input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)} />收藏项目</label>
          <button className="primary" type="submit">保存项目</button><button type="button" onClick={() => { void ask('将项目移入回收站？共享资料与笔记会保留，恢复项目后原关联仍在。').then(confirmed=>{if(confirmed)void action(async () => { setProject(await command('set_project_deleted', { id: project.id, baseRevision: project.revision, deleted: true })); });}); }}>移入回收站</button>
        </fieldset></form>
      </div>
      {onOpenTasks && <ProjectTasks id={project.id} onOpen={onOpenTasks} />}
      <Resources projectId={project.id} onOpenNote={onOpenNote} onOpenDocument={onOpenDocument} onCreateNote={onCreateNote} onChanged={async () => { await refreshImages(); await onChanged(); }} />
    </>}
  </section>;
}
