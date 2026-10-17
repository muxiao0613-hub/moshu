/** 跨专项的问题收件箱；读取当前有效性、记录作者决策、跳回正文与专项重新检查。 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { workChapterPath, workRefinePath } from '@/shared/lib/workRoutes';
import type { RevisionIssue } from '@/shared/types/revisionIssue';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';
import { getIssueSnapshot, markIssue } from '../issueApi';
const SOURCES = { consistency: ['一致性', 'conflicts'], 'ai-flavor': ['AI 味', 'ai-flavor'], pacing: ['节奏', 'pacing'], review: ['评审', 'review'] } as const;
const STATES = { open: '待处理', handled: '作者已处理', dismissed: '作者选择保留', resolved: '复检未再检出', stale: '依据已过期' };
export function IssuesView({ projectId }: { projectId: string }) {
  const [issues, setIssues] = useState<RevisionIssue[]>([]), [filter, setFilter] = useState('open'), [source, setSource] = useState('all');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const scope = useRef(projectId); scope.current = projectId;
  const load = async () => { setBusy(true); setError(''); try { const result = await getIssueSnapshot(projectId); if (scope.current === projectId) setIssues(result.issues); } catch { if (scope.current === projectId) setError('问题台账读取失败，请重试'); } finally { if (scope.current === projectId) setBusy(false); } };
  useEffect(() => { let alive = true; setIssues([]); setError(''); setBusy(false); getIssueSnapshot(projectId).then(s => { if (alive) setIssues(s.issues); }).catch(() => { if (alive) setError('问题台账读取失败，请重试'); }); return () => { alive = false; }; }, [projectId]);
  const mark = async (issue: RevisionIssue, state: 'open' | 'handled' | 'dismissed') => {
    setBusy(true); try { const result = await markIssue(projectId, issue, state); if (scope.current === projectId) setIssues(result.issues); toast.success('作者处理记录已保存'); }
    catch { toast.error('记录失败或依据已过期，请刷新后复检'); } finally { if (scope.current === projectId) setBusy(false); }
  };
  const visible = issues.filter(i => (filter === 'all' || i.state === filter) && (source === 'all' || i.source === source));
  return <div className="space-y-3">
    <p className="text-sm text-zinc-500">专项检查的发现会存入作品并随备份恢复。标记已处理记录作者选择；复检未检出仅表示本次检查没有再发现，依据变化会标为过期。</p>
    <div className="flex gap-2"><Select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option>{Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      <Select value={source} onChange={e => setSource(e.target.value)}><option value="all">全部专项</option>{Object.entries(SOURCES).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</Select>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>刷新（{visible.length}/{issues.length}）</Button></div>
    {error && <p className="text-red-600">{error}</p>}
    {!visible.length && <p className="text-sm text-zinc-500">此筛选下暂无问题。请从各专项运行检查，结果将统一保存在这里。</p>}
    {visible.map(i => <article key={i.id} className="border rounded-xl p-3 space-y-2 text-sm">
      <div className="flex gap-2"><b>{SOURCES[i.source][0]} · {i.type}</b><span className="text-zinc-500">{STATES[i.state]}</span></div>
      <p>{i.location}</p>{i.state === 'resolved' && <p className="text-xs text-zinc-500">以下保留上次发现的内容；当前复检未再检出。</p>}{i.quote && <blockquote className="text-zinc-500">“{i.quote}”</blockquote>}<p>{i.problem}</p><p>建议：{i.suggestion}</p>
      {i.referenceChapterId && <p className="text-xs">对照 <Link to={workChapterPath(projectId, i.referenceChapterId)} className="underline">来源章</Link>：“{i.referenceQuote}”</p>}
      <p className="text-xs text-zinc-500">{i.coverage} · {new Date(i.checkedAt).toLocaleString()}</p>
      <div className="flex gap-2 items-center flex-wrap"><Link className="text-ink-600" to={workChapterPath(projectId, i.chapterId)}>去正文修改</Link>
        <Link className="text-ink-600" to={workRefinePath(projectId, SOURCES[i.source][1])}>去专项复检</Link>
        {!['stale', 'resolved'].includes(i.state) && <><Button size="sm" variant="outline" disabled={busy} onClick={() => void mark(i, i.state === 'handled' ? 'open' : 'handled')}>{i.state === 'handled' ? '撤销已处理' : '作者已处理'}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mark(i, i.state === 'dismissed' ? 'open' : 'dismissed')}>{i.state === 'dismissed' ? '撤销保留' : '保留此写法'}</Button></>}
      </div>
    </article>)}
  </div>;
}
