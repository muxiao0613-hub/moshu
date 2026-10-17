/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * 长篇作品的写回动作：新建、编辑、删除、公开发布、导出 .mgao、导入 .mgao。
 *
 * 在拆分中的位置：写回 hook。对外门面是 `features/project/ProjectList.tsx`
 * （门面负责对话框开关与跳转，本文件只改数据）。短篇的写回见 `useStoryActions.ts`。
 * 依赖方向：`@/api`、`./types` →（本文件）→ 门面；不依赖任何 list/ 组件，也不依赖短篇写回。
 */
import type { MouseEvent } from 'react';
import {
  deleteProject, saveProject, toggleProjectPublish,
} from '@/api';
import { getHttpErrorMessage } from '@/shared/lib/utils';
import type { Project } from '@/shared/types';
import { toast } from '@/shared/ui/toast';
import { downloadProjectBackup, restoreProjectBackup } from '../backup';
import type { NovelFormValue, ProjectSetter } from './types';

/** 门面可调用的长篇写回动作。 */
export interface ProjectActions {
  createProject: (input: NovelFormValue) => Promise<Project | null>;
  updateProject: (target: Project, input: NovelFormValue) => Promise<Project | null>;
  removeProject: (target: Project) => Promise<void>;
  togglePublish: (e: MouseEvent, project: Project) => Promise<void>;
  exportProject: (e: MouseEvent, project: Project) => Promise<void>;
  importProject: (onImported: (projectId: string) => void) => void;
}

export function useProjectActions({ setProjects }: { setProjects: ProjectSetter }): ProjectActions {
  const createProject = async (input: NovelFormValue) => {
    if (!input.title.trim()) return null;
    const saved = await saveProject({
      title: input.title.trim(),
      genre: input.genre,
      synopsis: input.synopsis.trim(),
      qualityGoal: input.qualityGoal?.trim() || '',
    });
    setProjects(prev => [...prev, saved]);
    return saved;
  };

  const updateProject = async (target: Project, input: NovelFormValue) => {
    if (!input.title.trim()) return null;
    const saved = await saveProject({
      id: target.id,
      title: input.title.trim(),
      genre: input.genre,
      synopsis: input.synopsis.trim(),
      qualityGoal: input.qualityGoal?.trim() || '',
      updatedAt: new Date(),
    });
    setProjects(prev => prev.map(p => p.id === saved.id ? saved : p));
    return saved;
  };

  const removeProject = async (target: Project) => {
    await deleteProject(target.id);
    setProjects(prev => prev.filter(p => p.id !== target.id));
  };

  const togglePublish = async (e: MouseEvent, project: Project) => {
    e.stopPropagation();
    const { isPublic } = await toggleProjectPublish(project.id);
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, isPublic } : p));
    toast.success(isPublic ? '已公开' : '已取消公开');
  };

  const exportProject = async (e: MouseEvent, project: Project) => {
    e.stopPropagation();
    try {
      await downloadProjectBackup(project.id);
      toast.success('已导出完整备份（服务端已保存内容与版本）');
    } catch (err) {
      toast.error(getHttpErrorMessage(err, { default: '导出失败，请重试' }));
    }
  };

  /**
   * 导入 .mgao。文件选择框是回调式 API，没法把新项目 id 返回给调用方，
   * 所以用 `onImported` 回调把跳转留给门面（本 hook 不关心路由）。
   */
  const importProject = (onImported: (projectId: string) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mgao';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        toast.info('正在校验并恢复备份…');
        const newProject = await restoreProjectBackup(JSON.parse(text));
        const pid = newProject.id;
        setProjects(prev => [...prev, newProject]);
        toast.success(`《${newProject.title}》导入成功`);
        onImported(pid);
      } catch (err) {
        toast.error(getHttpErrorMessage(err, { default: '导入失败，请重试' }));
      }
    };
    input.hidden = true; document.body.appendChild(input);
    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.addEventListener('change', () => input.remove(), { once: true });
    input.click();
  };

  return { createProject, updateProject, removeProject, togglePublish, exportProject, importProject };
}
