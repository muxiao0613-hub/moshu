/**
 * AI 助手面板 · 模块修复（一键修复全部 + 时间线/大纲/伏笔/人物/世界观分模块修复）。
 *
 * 位置：./panel 的修复层，由 AIPanel.tsx 容器调用；修复对话框的打开状态在这里，
 * 展示交给 PanelFixActions（含 ModuleFixDialog）。
 * 依赖方向：@/api（读写）+ @/features/ai/aiService（修复建议）+ @/shared/ui/toast
 * → ../ModuleFixDialog（EntityFix 类型）、./types；不引用展示组件。
 */
import { useState } from 'react';

import {
  getCharacters, getOutlines, getThreads, getTimelineEvents, getWorldSettings,
  saveCharacter, saveOutline, saveThread, saveTimelineEvent, saveWorldSetting,
} from '@/api';
import {
  fixCharactersWithAI,
  fixOutlinesWithAI,
  fixThreadsWithAI,
  fixTimelineWithAI,
  fixWorldSettingsWithAI,
} from '@/features/ai/aiService';
import { toast } from '@/shared/ui/toast';
import type {
  Character, Outline, PlotThread, Project, TimelineEvent, WorldSetting,
} from '@/shared/types';

import type { EntityFix } from '../ModuleFixDialog';
import type { EntityLike, FixDialogState } from './types';

export interface UseModuleFixParams {
  projectId: string;
  project: Project | undefined;
  /** 全局检查的产出文本，作为修复建议的 issuesText */
  result: string;
  /** 修复应用成功后刷新知识库数据 */
  refreshAll: () => void;
}

export function useModuleFix({ projectId, project, result, refreshAll }: UseModuleFixParams) {
  // 哪个模块正在生成修复
  const [fixLoading, setFixLoading] = useState<string | null>(null);
  const [fixDialog, setFixDialog] = useState<FixDialogState | null>(null);

  const withFix = async (
    key: string,
    run: () => Promise<EntityFix[]>,
    entities: EntityLike[],
    title: string,
    fieldLabels: Record<string, string>,
    applyFn: (fix: EntityFix) => Promise<void>
  ) => {
    if (!project) return;
    setFixLoading(key);
    try {
      const fixes = await run();
      if (fixes.length === 0) { toast.info('AI 未找到需要修正的内容'); return; }
      setFixDialog({
        title,
        fixes,
        entities,
        fieldLabels,
        onApply: async (selected) => {
          for (const fix of selected) await applyFn(fix);
          refreshAll();
        },
      });
    } catch (e) { toast.error('修复失败：' + (e as Error).message); }
    finally { setFixLoading(null); }
  };

  // 一键修复全部模块
  const handleFixAll = async () => {
    if (!project) return;
    setFixLoading('all');
    try {
      const [events, outs, ts, chars, ws] = await Promise.all([
        getTimelineEvents(projectId),
        getOutlines(projectId),
        getThreads(projectId),
        getCharacters(projectId),
        getWorldSettings(projectId),
      ]);

      // 并行请求所有模块的修复建议；allSettled 确保单个模块失败不阻断其他
      const settled = await Promise.allSettled([
        fixTimelineWithAI({ project, events, issuesText: result }),
        fixOutlinesWithAI({ project, outlines: outs, issuesText: result }),
        fixThreadsWithAI({ project, threads: ts, issuesText: result }),
        fixCharactersWithAI({ project, characters: chars, issuesText: result }),
        fixWorldSettingsWithAI({ project, settings: ws, issuesText: result }),
      ]);

      const [timelineFixes, outlineFixes, threadFixes, charFixes, worldFixes] =
        settled.map(r => r.status === 'fulfilled' ? r.value : []) as [
          typeof events extends unknown[] ? EntityFix[] : EntityFix[],
          EntityFix[], EntityFix[], EntityFix[], EntityFix[]
        ];

      const failedModules = settled.filter(r => r.status === 'rejected').length;
      if (failedModules > 0) {
        console.warn(`${failedModules} 个模块的修复请求失败，已跳过`);
      }

      // 为每个 fix 加上模块标签，合并到同一个列表，用 moduleTag 字段区分
      const tag = (fixes: EntityFix[], module: string) =>
        fixes.map(f => ({ ...f, _module: module }));

      const allFixes: EntityFix[] = [
        ...tag(timelineFixes, 'timeline'),
        ...tag(outlineFixes, 'outline'),
        ...tag(threadFixes, 'thread'),
        ...tag(charFixes, 'character'),
        ...tag(worldFixes, 'world'),
      ];

      if (allFixes.length === 0) {
        toast.info('AI 分析后未发现需要具体修正的字段');
        return;
      }

      const allEntities = ([
        ...events, ...outs, ...ts, ...chars, ...ws,
      ] as unknown) as EntityLike[];

      setFixDialog({
        title: '一键修复全部问题',
        fixes: allFixes,
        entities: allEntities,
        fieldLabels: {
          title: '标题', date: '时间', description: '描述', line: '时间线', type: '类型',
          summary: '概要', keyEvents: '关键事件',
          status: '状态', importance: '重要性', plantedAt: '埋设章节', resolvedAt: '回收章节',
          personality: '性格', abilities: '能力', background: '背景', arc: '命运弧线', appearance: '外貌',
          content: '内容',
        },
        onApply: async (selected) => {
          for (const fix of selected) {
            const module = (fix as EntityFix & { _module?: string })._module;
            if (module === 'timeline') {
              const orig = events.find(e => e.id === fix.id);
              if (orig) await saveTimelineEvent({ ...orig, ...fix } as TimelineEvent);
            } else if (module === 'outline') {
              const orig = outs.find(o => o.id === fix.id);
              if (orig) await saveOutline({ ...orig, ...fix } as Outline);
            } else if (module === 'thread') {
              const orig = ts.find(t => t.id === fix.id);
              if (orig) await saveThread({ ...orig, ...fix } as PlotThread);
            } else if (module === 'character') {
              const orig = chars.find(c => c.id === fix.id);
              if (orig) await saveCharacter({ ...orig, ...fix } as Character);
            } else if (module === 'world') {
              const orig = ws.find(s => s.id === fix.id);
              if (orig) await saveWorldSetting({ ...orig, ...fix } as WorldSetting);
            }
          }
          refreshAll();
        },
      });
    } catch (e) {
      toast.error('修复失败：' + (e as Error).message);
    } finally {
      setFixLoading(null);
    }
  };

  const handleFixTimeline = async () => {
    const events = await getTimelineEvents(projectId);
    await withFix(
      'timeline',
      () => fixTimelineWithAI({ project: project!, events, issuesText: result }),
      events as unknown as EntityLike[],
      '修复时间线',
      { title: '标题', date: '时间', description: '描述', line: '时间线', type: '类型' },
      async (fix) => {
        const orig = events.find(e => e.id === fix.id);
        if (orig) await saveTimelineEvent({ ...orig, ...fix } as TimelineEvent);
      }
    );
  };

  const handleFixOutlines = async () => {
    const outs = await getOutlines(projectId);
    await withFix(
      'outline',
      () => fixOutlinesWithAI({ project: project!, outlines: outs, issuesText: result }),
      outs as unknown as EntityLike[],
      '修复大纲',
      { title: '标题', summary: '概要', keyEvents: '关键事件' },
      async (fix) => {
        const orig = outs.find(o => o.id === fix.id);
        if (orig) await saveOutline({ ...orig, ...fix } as Outline);
      }
    );
  };

  const handleFixThreads = async () => {
    const ts = await getThreads(projectId);
    await withFix(
      'thread',
      () => fixThreadsWithAI({ project: project!, threads: ts, issuesText: result }),
      ts as unknown as EntityLike[],
      '修复伏笔',
      { status: '状态', importance: '重要性', description: '描述', plantedAt: '埋设章节', resolvedAt: '回收章节' },
      async (fix) => {
        const orig = ts.find(t => t.id === fix.id);
        if (orig) await saveThread({ ...orig, ...fix } as PlotThread);
      }
    );
  };

  const handleFixCharacters = async () => {
    const chars = await getCharacters(projectId);
    await withFix(
      'character',
      () => fixCharactersWithAI({ project: project!, characters: chars, issuesText: result }),
      chars as unknown as EntityLike[],
      '修复人物设定',
      { personality: '性格', abilities: '能力', background: '背景', arc: '命运弧线', appearance: '外貌' },
      async (fix) => {
        const orig = chars.find(c => c.id === fix.id);
        if (orig) await saveCharacter({ ...orig, ...fix } as Character);
      }
    );
  };

  const handleFixWorld = async () => {
    const ws = await getWorldSettings(projectId);
    await withFix(
      'world',
      () => fixWorldSettingsWithAI({ project: project!, settings: ws, issuesText: result }),
      ws as unknown as EntityLike[],
      '修复世界观',
      { title: '标题', content: '内容' },
      async (fix) => {
        const orig = ws.find(s => s.id === fix.id);
        if (orig) await saveWorldSetting({ ...orig, ...fix } as WorldSetting);
      }
    );
  };

  return {
    fixLoading,
    fixDialog,
    closeFixDialog: () => setFixDialog(null),
    handleFixAll,
    handleFixTimeline,
    handleFixOutlines,
    handleFixThreads,
    handleFixCharacters,
    handleFixWorld,
  };
}
