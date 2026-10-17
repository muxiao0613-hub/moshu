import { useEffect, useMemo, useState } from 'react';
import { Fingerprint, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getProjects, getProject, getChaptersWithContent, saveProject } from '@/api';
import {
  MAX_STYLE_SAMPLES,
  MAX_STYLE_SAMPLE_CHARS,
  extractStyleFingerprint,
  extractStyleSamples,
  formatFingerprintSummary,
  styleSampleHint,
} from '@/shared/lib/styleFingerprint';
import { stripHtml } from '@/features/ai/aiService';
import type { Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

/**
 * 风格样本库（REFACTOR_PLAN.md §6.3 第 3 项）。
 *
 * 为什么放在设置里：样本是**作品级**的长期资产，不是某一次生成的临时参数；
 * 它要能跨章节、跨会话复用，所以存进项目（`Project.styleSamples`）而不是组件状态。
 * 提取入口原来藏在「使用说明」页里（那个页面只有从高级菜单进得去），已随本批删除。
 *
 * 和风格指纹的关系：指纹是统计量（句均/对话比例），样本是作者原文。
 * 两者都会进提示词（`buildChapterSystemPrompt` 走上下文编译器、
 * `buildLongFormContext` 走整章生成与单场重写），样本排在指纹之后。
 */
export function StyleSampleSection() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fingerprinting, setFingerprinting] = useState(false);

  useEffect(() => {
    getProjects()
      .then(list => {
        setProjects(list);
        if (list.length > 0) setProjectId(prev => prev || list[0].id);
      })
      .catch(() => toast.error('作品列表加载失败'));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    setLoading(true);
    getProject(projectId)
      .then(p => setProject(p ?? null))
      .catch(() => toast.error('作品加载失败'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const samples = project?.styleSamples ?? [];

  const persist = async (next: string[], message: string) => {
    if (!project) return;
    const saved = await saveProject({ ...project, styleSamples: next, updatedAt: new Date() });
    setProject(saved);
    setProjects(prev => prev.map(p => (p.id === saved.id ? saved : p)));
    toast.success(message);
  };

  /** 从「定稿」章节里抽样本：定稿章节才是作者认可的文风 */
  const handleExtract = async () => {
    if (!project) return;
    setExtracting(true);
    try {
      const chapters = await getChaptersWithContent(project.id);
      const finals = chapters.filter(c => c.status === 'final' && c.content);
      if (finals.length === 0) {
        toast.error('还没有「定稿」章节：把认可的章节标为定稿后再提取');
        return;
      }
      const picked = extractStyleSamples(finals.map(c => stripHtml(c.content)));
      if (picked.length === 0) {
        toast.error('定稿章节太短（每段至少 80 字）');
        return;
      }
      await persist(picked, `已从 ${finals.length} 章定稿中提取 ${picked.length} 段样本`);
    } catch (e) {
      toast.error('提取失败：' + (e as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  const handleAdd = async () => {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (text.length < 80) {
      toast.error('样本至少 80 字才能体现语感');
      return;
    }
    if (samples.length >= MAX_STYLE_SAMPLES) {
      toast.error(`最多 ${MAX_STYLE_SAMPLES} 段：删掉一段再加`);
      return;
    }
    setDraft('');
    await persist(
      [...samples, text.slice(0, MAX_STYLE_SAMPLE_CHARS)],
      '已添加样本',
    );
  };

  const handleRemove = async (index: number) => {
    await persist(samples.filter((_, i) => i !== index), '已删除该样本');
  };

  const handleFingerprint = async () => {
    if (!project) return;
    setFingerprinting(true);
    try {
      const chapters = await getChaptersWithContent(project.id);
      const finals = chapters.filter(c => c.status === 'final' && c.content).slice(0, 5);
      if (finals.length === 0) {
        toast.error('还没有「定稿」章节');
        return;
      }
      const text = finals.map(c => stripHtml(c.content)).join('\n\n');
      const fp = extractStyleFingerprint(text, finals.map(c => c.id));
      const saved = await saveProject({ ...project, styleFingerprint: fp, updatedAt: new Date() });
      setProject(saved);
      setProjects(prev => prev.map(p => (p.id === saved.id ? saved : p)));
      toast.success('风格指纹已更新：' + formatFingerprintSummary(fp));
    } catch (e) {
      toast.error('提取失败：' + (e as Error).message);
    } finally {
      setFingerprinting(false);
    }
  };

  const hint = useMemo(() => styleSampleHint(samples), [samples]);
  const hintTokens = hint ? hint.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">作品</label>
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 outline-none"
        >
          {projects.length === 0 && <option value="">（还没有作品）</option>}
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
      </div>

      {project && (
        <>
          {/* 风格样本 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExtract} disabled={extracting} className="gap-1.5">
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                从定稿章节提取
              </Button>
              <span className="text-xs text-zinc-400">
                {samples.length} / {MAX_STYLE_SAMPLES} 段 · 每段最多 {MAX_STYLE_SAMPLE_CHARS} 字
              </span>
            </div>

            {samples.length === 0 ? (
              <p className="text-xs text-zinc-400 leading-relaxed">
                还没有样本。样本是你自己写的原文，注入后 AI 会照它的语感写，比「句均 18 字」这类统计量有效得多。
                从定稿章节自动提取，或在下面粘贴一段。
              </p>
            ) : (
              <ul className="space-y-2">
                {samples.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] text-zinc-400 shrink-0">样本 {i + 1} · {s.length} 字</span>
                      <button
                        onClick={() => handleRemove(i)}
                        className="text-zinc-400 hover:text-red-500 transition-colors shrink-0"
                        title="删除这段样本"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{s}</p>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={3}
                placeholder="粘贴一段你自己的原文（至少 80 字）…"
                className="w-full px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 outline-none focus:border-zinc-400"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">{draft.trim().length} 字</span>
                <Button variant="outline" size="sm" onClick={handleAdd} disabled={!draft.trim()} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  添加为样本
                </Button>
              </div>
            </div>

            {hint && (
              <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                <summary className="px-2.5 py-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
                  看这段样本怎么进提示词（约 {hintTokens} 字，续写 / 整章生成 / 单场重写都会带上）
                </summary>
                <pre className="px-2.5 pb-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">{hint}</pre>
              </details>
            )}
          </div>

          {/* 风格指纹（原「使用说明」页里的入口，随该页删除迁到这里） */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleFingerprint} disabled={fingerprinting} className="gap-1.5">
                {fingerprinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
                {project.styleFingerprint ? '重新提取风格指纹' : '提取风格指纹'}
              </Button>
              {project.styleFingerprint && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatFingerprintSummary(project.styleFingerprint)}
                </span>
              )}
            </div>
            {project.styleFingerprint ? (
              <p className="text-[11px] text-zinc-400">
                高频短语：{project.styleFingerprint.topPhrases.slice(0, 8).join('、') || '—'}
              </p>
            ) : (
              <p className="text-xs text-zinc-400 leading-relaxed">
                尚未提取。指纹是统计量（句均字数、对话比例），样本是原文片段 —— 建议两个都有。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
