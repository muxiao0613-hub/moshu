/** 一致性检查结果：原文引用、跳章、作者处理标记；重跑以当前正文复核，停止真正取消请求。 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChaptersWithContent, getCharacters, getOutlines, getProject, getThreads, getWorldSettings } from '@/api';
import { checkConsistency, type ConsistencyResult } from '@/features/ai/service/consistency';
import type { RevisionIssue } from '@/shared/types/revisionIssue';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { workChapterPath } from '@/shared/lib/workRoutes';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import type { Chapter } from '@/shared/types';
import { getIssueSnapshot, replaceIssues, markIssue } from '../issueApi';
interface SavedCheck extends ConsistencyResult { handled: string[] }
export function ConflictsView({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [report, setReport] = useState<SavedCheck | null>(null);
  const [stale, setStale] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [tracked, setTracked] = useState<RevisionIssue[]>([]);
  const key = `mogao_consistency_${projectId}`;
  const persist = (value: SavedCheck) => {
    setReport(value);
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { toast.error('检查结果无法保存在本机，请复制所需内容'); }
  };
  useEffect(() => {
    let active = true;
    setReport(null); setStale(false); setError('');
    getIssueSnapshot(projectId).then(s => { if (active) setTracked(s.issues.filter(i => i.source === 'consistency')); })
      .catch(() => { if (active) setError('持久化问题读取失败，请重试'); });
    getChaptersWithContent(projectId).then(async list => {
      if (!active) return;
      setChapters(list);
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null') as SavedCheck | null;
        if (!saved || !Array.isArray(saved.issues) || !saved.sources) return;
        const hashes = await Promise.all(list.map(async c => [c.id, await chapterMemoryHash(c.content)]));
        if (!active) return;
        setReport({ ...saved, handled: saved.handled ?? [] });
        setStale(Object.keys(saved.sources).length !== list.length || hashes.some(([id, hash]) => saved.sources[id] !== hash));
      } catch { if (active) setError('本机旧报告读取失败，请重新检查'); }
    }).catch(() => { if (active) setError('读取正文失败，请重试'); });
    return () => { active = false; abortRef.current?.abort(); };
  }, [projectId, key]);
  const run = async () => {
    if (abortRef.current) return;
    const controller = new AbortController(); abortRef.current = controller;
    setRunning(true); setError(''); setProgress('正在读取当前正文…');
    try {
      const basis = await getIssueSnapshot(projectId);
      const [project, characters, worldSettings, outlines, threads, list] = await Promise.all([
        getProject(projectId), getCharacters(projectId), getWorldSettings(projectId), getOutlines(projectId), getThreads(projectId), getChaptersWithContent(projectId),
      ]);
      if (!project) throw new Error('读取作品失败');
      const result = await checkConsistency({ project, characters, worldSettings, outlines, threads, chapters: list,
        signal: controller.signal, onChunk: c => { if (!controller.signal.aborted) setProgress(c); } });
      if (controller.signal.aborted) return;
      const latest = await getChaptersWithContent(projectId);
      const matches = await Promise.all(latest.map(async c => result.sources[c.id] === await chapterMemoryHash(c.content)));
      if (controller.signal.aborted) return;
      setChapters(latest); setStale(latest.length !== list.length || matches.some(m => !m));
      if (matches.some(m => !m) || latest.length !== list.length) throw new Error('正文已变更，请重新检查');
      const snapshot = await replaceIssues(projectId, 'consistency', list, result.issues, result.coverage, basis.basisHash);
      if (controller.signal.aborted) return;
      setTracked(snapshot.issues.filter(i => i.source === 'consistency'));
      persist({ ...result, handled: [] });
      toast.success('检查结果已保存到作品问题台账');
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '检查失败，请重试'); }
    finally { if (abortRef.current === controller) { abortRef.current = null; setRunning(false); } }
  };
  return <div className="space-y-4">
    <div className="flex gap-2"><Button onClick={run} disabled={running}>{report ? '重新检查当前全书' : '检查全书一致性'}</Button>
      {running && <Button variant="outline" onClick={() => abortRef.current?.abort()}>停止检查</Button>}</div>
    <p className="text-xs text-zinc-500">逐段读取实际正文，按人物档案和有效事实核查。问题可跳章修订；作者处理标记只记录选择，重新检查会复核。全书扫描会产生多次模型调用。</p>
    {running && <p className="text-xs">{progress}</p>}
    {error && <p className="text-sm text-red-600">{error}</p>}
    {stale && <p className="text-sm text-amber-600">报告与当前正文不同，请重新检查；以下只作历史参考。</p>}
    {report && <><p className="text-xs text-zinc-500">{report.coverage} 检查时间：{new Date(report.checkedAt).toLocaleString()}。设定变更后也需重新检查。</p>
      {!report.issues.length && <p>本次未发现有原文证据的矛盾。</p>}
      {report.issues.map((issue, index) => <div key={index} className="border rounded-xl p-3 space-y-2">
        <div className="flex gap-2 text-sm"><b>{issue.type}</b><Link className="text-ink-600" to={workChapterPath(projectId, issue.chapterId)}>去修改《{chapters.find(c => c.id === issue.chapterId)?.title || '来源章'}》</Link></div>
        <blockquote className="text-sm text-zinc-500">“{issue.quote}”</blockquote>
        {issue.referenceChapterId && <p className="text-xs">对照 <Link className="text-ink-600" to={workChapterPath(projectId, issue.referenceChapterId)}>来源章</Link>：“{issue.referenceQuote}”</p>}
        <p className="text-sm">{issue.problem}</p><p className="text-sm">建议：{issue.suggestion}</p>
        <Button size="sm" variant="outline" disabled={stale || running} onClick={async () => {
          const entry = tracked.find(i => i.chapterId === issue.chapterId && i.problem === issue.problem && i.quote === issue.quote);
          if (!entry) { toast.error('请先重新检查以保存到问题台账'); return; }
          try { setTracked((await markIssue(projectId, entry, entry.state === 'handled' ? 'open' : 'handled')).issues.filter(i => i.source === 'consistency')); }
          catch { toast.error('问题依据已变更，请复检'); }
        }}>{tracked.some(i => i.chapterId === issue.chapterId && i.problem === issue.problem && i.state === 'handled') ? '作者已处理（点击撤销）' : '标记已处理'}</Button>
      </div>)}
    </>}
  </div>;
}
