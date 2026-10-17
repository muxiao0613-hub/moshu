/** 一键成稿内部流水线；候选设定先落库，每一步由调用方验证仍属于当前故事。 */
import { saveShortStory } from '@/api';
import { getTemplateForGenre } from '@/features/short-story/shortStoryTemplates';
import { enhanceStoryPremise, generateStoryStructure, generateMultipleOpenings, generateFullShortStory, generateStoryTitle } from '@/features/short-story/shortStoryService';
import type { ShortStory } from '@/shared/types';
import { fallbackTitle, getFallbackPremise, mergeEnhancementConstraint } from './utils';
export async function generateStoryDraft(initial: ShortStory, scope: { check: () => void; append: (s: string) => void }, onSettings: (story: ShortStory) => void) {
  let current = { ...initial, premise: initial.premise?.trim() || getFallbackPremise(initial) };
  const save = async (patch: Partial<ShortStory>) => {
    scope.check();
    const saved = await saveShortStory({ id: current.id, ...patch });
    scope.check(); current = { ...current, ...patch, updatedAt: saved.updatedAt }; onSettings(current);
  };
  await save({ premise: current.premise });
  scope.append('【1/4】补强内核…\n');
  try {
    const enhanced = await enhanceStoryPremise({ story: current, onChunk: () => {} });
    scope.check(); await save({ styleConstraint: mergeEnhancementConstraint(current.styleConstraint, enhanced.premise, enhanced.styleConstraint) });
  } catch (e) { scope.check(); scope.append(`内核补强失败，继续使用原设定：${e instanceof Error ? e.message : '调用失败'}\n`); }
  scope.append('【2/4】生成骨架…\n');
  const template = getTemplateForGenre(current.genre);
  const plotPoints = await generateStoryStructure({ story: current, templateLabels: template.points.map(p => p.label), onChunk: () => {} });
  scope.check(); await save({ plotPoints });
  scope.append('【3/4】准备开头…\n');
  let openings: string[] = [];
  try { openings = await generateMultipleOpenings({ story: current, plotPoints }); }
  catch { scope.check(); scope.append('开头候选失败，直接按骨架成稿。\n'); }
  scope.check(); scope.append('【4/4】撰写全文…\n');
  const content = await generateFullShortStory({ story: current, plotPoints, chosenOpening: openings[0], onChunk: scope.append });
  scope.check();
  let title = current.title;
  if (!title || title === '无标题故事') {
    try { title = (await generateStoryTitle({ story: current, content })).trim(); }
    catch { title = ''; }
    scope.check(); title = title || fallbackTitle(content);
  }
  return { story: { ...current, title }, content };
}
