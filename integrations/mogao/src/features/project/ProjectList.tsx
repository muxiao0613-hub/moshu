/**
 * 作品库首页（长篇 + 短篇）。
 *
 * 在拆分中的位置：对外门面。路由 `App.tsx` 仍从本文件取 `ProjectList`，调用点零改动；
 * 实现按职责拆到 `./list/`：
 *   取数 useProjectLibrary / 写回 useProjectActions、useStoryActions /
 *   网格 NovelGrid、StoryGrid / 弹窗 ProjectDialogs、StoryDialogs /
 *   顶栏 LibraryHeader，静态配置与表单类型在 constants.ts、types.ts。
 * 本文件只保留编排：状态、对话框开关、跳转。
 * 依赖方向：门面 → list/*（单向）；list/* 内部为 types ← constants ← hooks/components。
 */
import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { chooseStoryBackup } from '@/features/short-story/backup';
import { ImportWizard } from '@/shared/layout/ImportWizard';
import { TopBar } from '@/shared/layout/TopBar';
import { workBase } from '@/shared/lib/workRoutes';
import type { Project, ShortStory, StoryGenre, StoryPlatform } from '@/shared/types';
import { DeleteConfirmDialog } from '@/shared/ui/DeleteConfirmDialog';
import { EMPTY_NOVEL_FORM, EMPTY_STORY_FORM } from './list/constants';
import { LibraryHeader } from './list/LibraryHeader';
import { NovelGrid } from './list/NovelGrid';
import { CreateProjectDialog, EditProjectDialog } from './list/ProjectDialogs';
import { StoryGrid } from './list/StoryGrid';
import { CreateStoryDialog, EditStoryDialog } from './list/StoryDialogs';
import type { LibraryTab, NovelFormValue, StoryEditFormValue, StoryFormValue } from './list/types';
import { useProjectActions } from './list/useProjectActions';
import { useProjectLibrary } from './list/useProjectLibrary';
import { useStoryActions } from './list/useStoryActions';

export function ProjectList() {
  const navigate = useNavigate();
  const library = useProjectLibrary();
  const projectActions = useProjectActions({ setProjects: library.setProjects });
  const storyActions = useStoryActions({ setShortStories: library.setShortStories });

  const [tab, setTab] = useState<LibraryTab>(
    () => (localStorage.getItem('mogao_home_tab') as LibraryTab) ?? 'novels'
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [storyForm, setStoryForm] = useState<StoryFormValue>(EMPTY_STORY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteStoryTarget, setDeleteStoryTarget] = useState<ShortStory | null>(null);
  const [editStoryTarget, setEditStoryTarget] = useState<ShortStory | null>(null);
  const [editStoryForm, setEditStoryForm] = useState<StoryEditFormValue>({
    title: '', genre: '情感' as StoryGenre, platform: '小红书故事' as StoryPlatform, premise: '',
  });
  const [form, setForm] = useState<NovelFormValue>(EMPTY_NOVEL_FORM);
  const [editForm, setEditForm] = useState<NovelFormValue>(EMPTY_NOVEL_FORM);

  const patchForm = (patch: Partial<NovelFormValue>) => setForm(f => ({ ...f, ...patch }));
  const patchEditForm = (patch: Partial<NovelFormValue>) => setEditForm(f => ({ ...f, ...patch }));
  const patchStoryForm = (patch: Partial<StoryFormValue>) => setStoryForm(f => ({ ...f, ...patch }));
  const patchEditStoryForm = (patch: Partial<StoryEditFormValue>) => setEditStoryForm(f => ({ ...f, ...patch }));

  const changeTab = (next: LibraryTab) => {
    setTab(next);
    localStorage.setItem('mogao_home_tab', next);
  };

  const handleCreate = async () => {
    const saved = await projectActions.createProject(form);
    if (!saved) return;
    setCreateOpen(false);
    setForm(EMPTY_NOVEL_FORM);
    navigate(workBase(saved.id));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await projectActions.removeProject(deleteTarget);
    setDeleteTarget(null);
  };

  const handleCreateStory = async () => {
    const saved = await storyActions.createStory(storyForm);
    setCreateStoryOpen(false);
    setStoryForm({ ...EMPTY_STORY_FORM });
    navigate(`/short/${saved.id}`);
  };

  const handleDeleteStory = async () => {
    if (!deleteStoryTarget) return;
    await storyActions.removeStory(deleteStoryTarget);
    setDeleteStoryTarget(null);
  };

  const handleEditStorySave = async () => {
    if (!editStoryTarget) return;
    const saved = await storyActions.updateStory(editStoryTarget, editStoryForm);
    if (saved) setEditStoryTarget(null);
  };

  const openEdit = (e: MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditTarget(project);
    setEditForm({ title: project.title, genre: project.genre, synopsis: project.synopsis, qualityGoal: project.qualityGoal });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    const saved = await projectActions.updateProject(editTarget, editForm);
    if (saved) setEditTarget(null);
  };

  const openStoryEdit = (e: MouseEvent, story: ShortStory) => {
    e.stopPropagation();
    setEditStoryTarget(story);
    setEditStoryForm({
      title: story.title,
      genre: story.genre as StoryGenre,
      platform: story.platform as StoryPlatform,
      premise: story.premise || '',
    });
  };

  return (
    <div className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-900">
      <TopBar
        onImport={() => tab === 'stories' ? chooseStoryBackup(id => navigate(`/short/${id}`)) : projectActions.importProject(id => navigate(workBase(id)))}
      />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Tab 切换 */}
          <LibraryHeader
            tab={tab}
            novelCount={library.projects.length}
            storyCount={library.shortStories.length}
            onChangeTab={changeTab}
            onCreateNovel={() => setCreateOpen(true)}
            onCreateStory={() => setCreateStoryOpen(true)}
          />

          {/* 短篇列表 */}
          {tab === 'stories' && (
            <StoryGrid
              stories={library.shortStories}
              loading={library.loadingStories}
              onCreate={() => setCreateStoryOpen(true)}
              onOpen={story => navigate(`/short/${story.id}`)}
              onPublish={storyActions.toggleStoryPublish}
              onEdit={openStoryEdit}
              onExport={storyActions.exportStory}
              onDelete={(e, story) => { e.stopPropagation(); setDeleteStoryTarget(story); }}
            />
          )}

          {/* 长篇列表 */}
          {tab === 'novels' && (
            <NovelGrid
              projects={library.projects}
              wordCounts={library.wordCounts}
              loading={library.loadingProjects}
              onCreate={() => setCreateOpen(true)}
              onOpen={project => navigate(workBase(project.id))}
              onPublish={projectActions.togglePublish}
              onEdit={openEdit}
              onExport={projectActions.exportProject}
              onDelete={(e, project) => { e.stopPropagation(); setDeleteTarget(project); }}
            />
          )}
        </div>
      </main>

      {/* 新建长篇 Dialog */}
      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        value={form}
        onChange={patchForm}
        onSubmit={handleCreate}
      />

      {/* 编辑长篇 Dialog */}
      <EditProjectDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        value={editForm}
        onChange={patchEditForm}
        onSubmit={handleEditSave}
      />

      {/* Import Novel Wizard */}
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} />

      {/* 新建短篇 Dialog */}
      <CreateStoryDialog
        open={createStoryOpen}
        onClose={() => setCreateStoryOpen(false)}
        value={storyForm}
        onChange={patchStoryForm}
        onSubmit={handleCreateStory}
      />

      {/* 编辑短篇 Dialog */}
      <EditStoryDialog
        open={!!editStoryTarget}
        onClose={() => setEditStoryTarget(null)}
        value={editStoryForm}
        onChange={patchEditStoryForm}
        onSubmit={handleEditStorySave}
      />

      {/* 删除确认 - 长篇 */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除项目"
        description={`确定要删除《${deleteTarget?.title}》吗？此操作不可撤销，所有章节、人物、设定数据将永久丢失。`}
      />

      {/* 删除确认 - 短篇 */}
      <DeleteConfirmDialog
        open={!!deleteStoryTarget}
        onClose={() => setDeleteStoryTarget(null)}
        onConfirm={handleDeleteStory}
        title="删除短篇"
        description={`确定要删除《${deleteStoryTarget?.title}》吗？此操作不可撤销。`}
      />
    </div>
  );
}
