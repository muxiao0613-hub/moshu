/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/** 短篇备份与恢复：与长篇同名入口使用明确格式，恢复为新私有故事，保留骨架、报告与版本。 */
import { saveAs } from 'file-saver';
import { v4 as uuidv4 } from 'uuid';
import { countWords } from '@/features/chapter/api';
import { PLATFORM_CONFIGS, GENRE_CONFIGS } from '@/shared/lib/storyRules';
import { toast } from '@/shared/ui/toast';
import type { ShortStory, ShortStoryQualityReport, StoryGenre, StoryPlatform } from '@/shared/types';
import { saveShortStory } from './api';
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('短篇备份格式无效');
  return value as Record<string, unknown>;
};
const string = (value: unknown, label: string) => { if (typeof value !== 'string') throw new Error(`${label}格式无效`); return value; };
export async function downloadStoryBackup(story: ShortStory): Promise<void> {
  await saveAs(new Blob([JSON.stringify({ format: 'mogao-short', version: 1, story }, null, 2)], { type: 'application/json' }), `${story.title || '短篇'}.mgao`);
}
export async function restoreStoryBackup(input: unknown): Promise<ShortStory> {
  const bundle = record(input);
  if (bundle.format && (bundle.format !== 'mogao-short' || bundle.version !== 1)) throw new Error('不是受支持的短篇备份，请在对应作品类型下导入');
  const source = record(bundle.format ? bundle.story : input);
  const title = string(source.title, '标题'), content = string(source.content, '正文');
  const platform = string(source.platform, '平台'), genre = string(source.genre, '类型');
  if (!title.trim() || title.length > 200 || !Object.prototype.hasOwnProperty.call(PLATFORM_CONFIGS, platform) || !Object.prototype.hasOwnProperty.call(GENRE_CONFIGS, genre)) throw new Error('标题、平台或类型无效');
  const list = (value: unknown) => { if (!Array.isArray(value) || value.length > 200) throw new Error('骨架或版本列表无效'); return value; };
  const plotPoints = list(source.plotPoints ?? []).map(value => { const p = record(value);
    return { id: uuidv4(), label: string(p.label, '骨架名称'), hint: string(p.hint ?? '', '骨架提示'), content: string(p.content, '骨架内容'), order: Number(p.order) || 0 }; });
  const versions = list(source.versions ?? []).map(value => { const v = record(value), date = new Date(String(v.savedAt));
    if (!Number.isFinite(date.getTime())) throw new Error('历史版本日期无效');
    return { id: uuidv4(), content: string(v.content, '版本正文'), savedAt: date, note: string(v.note ?? '', '版本说明') }; });
  let qualityReport: ShortStoryQualityReport | undefined;
  if (source.qualityReport) {
    const r = record(source.qualityReport);
    for (const key of ['hookScore', 'structureScore', 'emotionArcScore', 'endingScore', 'infoDensityScore', 'totalScore'])
      if (typeof r[key] !== 'number' || !Number.isFinite(r[key])) throw new Error('质检报告分数无效');
    string(r.verdict, '评审结论'); list(r.suggestions).forEach(v => string(v, '评审建议')); list(r.formatIssues).forEach(v => string(v, '格式建议'));
    qualityReport = r as unknown as ShortStoryQualityReport;
  }
  const targetWords = Number(source.targetWords);
  if (!Number.isInteger(targetWords) || targetWords < 1 || targetWords > 100000) throw new Error('目标字数无效');
  return saveShortStory({ title, content, platform: platform as StoryPlatform, genre: genre as StoryGenre, targetWords,
    premise: string(source.premise ?? '', '核心想法'), styleConstraint: string(source.styleConstraint ?? '', '风格约束'),
    status: source.status === 'final' || source.status === 'revised' ? source.status : 'draft', wordCount: countWords(content), plotPoints, versions, qualityReport,
    isPublic: false, publishedAt: null });
}
export function chooseStoryBackup(onImported: (id: string) => void): void {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.mgao,.json';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    try { const story = await restoreStoryBackup(JSON.parse(await file.text())); toast.success('短篇已恢复为新作品'); onImported(story.id); }
    catch (e) { toast.error(e instanceof Error ? e.message : '短篇导入失败'); }
  };
  input.hidden = true; document.body.appendChild(input);
  input.addEventListener('cancel', () => input.remove(), { once: true });
  input.addEventListener('change', () => input.remove(), { once: true });
  input.click();
}
