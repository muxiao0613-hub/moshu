import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectDetail } from '../src/platform/ProjectDetail';
import { ResourceDetail } from '../src/platform/ResourceDetail';
import type { Project, Resource } from '../src/contracts';
import fixtures from './fixtures/contracts.json';

const bridge = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock('../src/shared/lib/bridge', async importOriginal => ({ ...await importOriginal<typeof import('../src/shared/lib/bridge')>(), command: bridge.command }));
afterEach(() => { cleanup(); bridge.command.mockReset(); });
const project: Project = { ...fixtures.project, status: 'archived' };
const resource: Resource = {
  id: '22222222-2222-4222-8222-222222222222', kind: 'link', name: '文档', description: '', source: '',
  folderId: null, originalName: null, url: 'https://example.com/', favorite: false, tags: [], projectIds: [],
  size: null, mimeType: null, sha256: null, revision: 4, createdAt: project.createdAt, updatedAt: project.updatedAt, deletedAt: null,
};
const conflict = { ...fixtures.error, code: 'CONFLICT' };

it('资料保存使用当前 revision，冲突保留输入与已存资料', async () => {
  bridge.command.mockRejectedValue(conflict);
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<ResourceDetail initial={resource} folders={[]} projects={[]} onChanged={changed} onClose={vi.fn()} onOpenNote={vi.fn()} />);
  const input = screen.getByLabelText('名称') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '我的未提交稿' } });
  fireEvent.click(screen.getByRole('button', { name: '保存资料信息' }));
  await screen.findByText(conflict.message);
  expect(input.value).toBe('我的未提交稿');
  expect(bridge.command).toHaveBeenCalledWith('save_resource', expect.objectContaining({ id: resource.id, baseRevision: 4, name: '我的未提交稿' }));
  expect(changed).not.toHaveBeenCalled();
});

it('资料关联成功后下一次保存使用新 revision，不丢正在编辑的说明', async () => {
  bridge.command.mockImplementation(async (name: string) => name === 'set_resource_project' ? { ...resource, projectIds: [project.id], revision: 5 } : { ...resource, description: '待整理', projectIds: [project.id], revision: 6 });
  render(<ResourceDetail initial={resource} folders={[]} projects={[project]} onChanged={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()} onOpenNote={vi.fn()} />);
  const input = screen.getByLabelText('说明') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: '待整理' } });
  fireEvent.click(screen.getByLabelText('学习计划 · 已归档'));
  await waitFor(() => expect((screen.getByLabelText('学习计划 · 已归档') as HTMLInputElement).checked).toBe(true));
  expect(input.value).toBe('待整理');
  fireEvent.click(screen.getByRole('button', { name: '保存资料信息' }));
  await screen.findByText('资料信息已保存。');
  expect(bridge.command).toHaveBeenCalledWith('save_resource', expect.objectContaining({ baseRevision: 5, description: '待整理' }));
});

it('修改项目失败时保留名称、收藏和标签，不把错误当保存成功', async () => {
  bridge.command.mockImplementation(async (name: string) => {
    if (name === 'save_project_details') throw conflict;
    if (name === 'list_resources' || name === 'list_folders' || name === 'list_projects') return [];
    throw new Error('unexpected command');
  });
  render(<ProjectDetail initial={project} onChanged={vi.fn()} onOpenNote={vi.fn()} onCreateNote={vi.fn()} onClose={vi.fn()} />);
  await waitFor(() => expect(bridge.command).toHaveBeenCalledWith('list_folders', { offset: 0, limit: 100 }));
  fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '修改后的名称' } });
  fireEvent.change(screen.getByLabelText('标签', { selector: '.form-grid input' }), { target: { value: '学习，阅读' } });
  fireEvent.click(screen.getByLabelText('收藏项目'));
  fireEvent.click(screen.getByRole('button', { name: '保存项目' }));
  await screen.findByText(conflict.message);
  expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('修改后的名称');
  expect((screen.getByLabelText('收藏项目') as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByText('项目已保存。')).toBeNull();
  expect(bridge.command).toHaveBeenCalledWith('save_project_details', expect.objectContaining({ baseRevision: 2, name: '修改后的名称', tags: ['学习', '阅读'], favorite: true, changeCover: false }));
});
