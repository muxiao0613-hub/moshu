/**
 * 大纲树（主容器）。
 *
 * 拆分位置：本文件是门面/编排层 —— 取数、增删改的落库与 AI 面板的模块上下文留在
 * 这里；渲染拆分到 `tree/` 下：`OutlineTreeToolbar`（头部与 AI 续写入口）、
 * `OutlineNode` + `OutlineNodeRow`（树节点与行内操作）、`OutlineEditDialog` /
 * `OutlineDeleteDialog` / `OutlineContinuationDialog`（三个弹窗），
 * 纯函数（层级展开、顺序号、节点工厂）在 `tree/outlineTreeUtils.ts`。
 * 对外导出保持 `export function OutlineTree` 不变，调用点无需改动。
 * 依赖方向：容器 → tree/*；tree/* 不反向依赖本文件。
 */

import { useCallback, useEffect, useState } from 'react';
import { AlignLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  getOutlines, saveOutline, deleteOutline, getChapters, getCharacters, getWorldSettings,
  getProject, syncOutlinesToChapters,
} from '@/api';
import { useEditor } from '@/shared/contexts/EditorContext';
import { workBase } from '@/shared/lib/workRoutes';
import type { Chapter, Character, Outline, Project, WorldSetting } from '@/shared/types';
import { toast } from '@/shared/ui/toast';
import { OutlineContinuationDialog } from './tree/OutlineContinuationDialog';
import { OutlineDeleteDialog } from './tree/OutlineDeleteDialog';
import { OutlineEditDialog } from './tree/OutlineEditDialog';
import { OutlineNode } from './tree/OutlineNode';
import { OutlineTreeToolbar } from './tree/OutlineTreeToolbar';
import { createOutlineNode, getChildNodes, getRootNodes } from './tree/outlineTreeUtils';

interface OutlineTreeProps {
  projectId: string;
}

export function OutlineTree({ projectId }: OutlineTreeProps) {
  const navigate = useNavigate();
  const [editTarget, setEditTarget] = useState<Outline | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Outline | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiContOpen, setAiContOpen] = useState(false);

  const { setModuleCtx } = useEditor();

  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [worldSettings, setWorldSettings] = useState<WorldSetting[]>([]);
  const [project, setProject] = useState<Project | null>(null);

  const refresh = useCallback(async () => {
    const [o, ch, c, w, p] = await Promise.all([
      getOutlines(projectId),
      getChapters(projectId),
      getCharacters(projectId),
      getWorldSettings(projectId),
      getProject(projectId),
    ]);
    setOutlines(o);
    setChapters(ch);
    setCharacters(c);
    setWorldSettings(w);
    setProject(p ?? null);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const rootNodes = getRootNodes(outlines);

  const openEdit = (node: Outline) => {
    setEditTarget(node);
    setModuleCtx({
      type: 'outline',
      label: node.title || '大纲',
      entityId: node.id,
      entitySnapshot: { ...node, targetField: 'summary', targetFieldLabel: '概要' },
      onApplyResult: (result) => setEditTarget(prev => prev ? { ...prev, summary: result } : prev),
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const count = await syncOutlinesToChapters(projectId);
      if (count > 0) {
        navigate(workBase(projectId));
      } else {
        toast.info('所有章节大纲节点已关联章节，无需同步。');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleAddRoot = (type: Outline['type'] = 'volume') => {
    const node = createOutlineNode({
      id: uuidv4(), projectId, type, parentId: null, order: outlines.length + 1,
    });
    setEditTarget(node);
    setModuleCtx({ type: 'outline', label: '大纲', entityId: node.id, entitySnapshot: { ...node } });
  };

  const handleAddChild = (parentId: string, type: Outline['type']) => {
    const node = createOutlineNode({
      id: uuidv4(), projectId, type, parentId, order: getChildNodes(outlines, parentId).length + 1,
    });
    setEditTarget(node);
    setModuleCtx({ type: 'outline', label: '大纲', entityId: node.id, entitySnapshot: { ...node } });
  };

  const handleSave = async () => {
    if (!editTarget || !editTarget.title.trim()) return;
    await saveOutline(editTarget);
    setEditTarget(null);
    setModuleCtx(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteOutline(deleteTarget.id, projectId);
    setDeleteTarget(null);
    await refresh();
  };

  return (
    <div className="h-full flex flex-col">
      <OutlineTreeToolbar
        nodeCount={outlines.length}
        hasChapterNodes={outlines.some(o => o.type === 'chapter')}
        syncing={syncing}
        onAddVolume={() => handleAddRoot('volume')}
        onAddChapter={() => handleAddRoot('chapter')}
        onOpenAIContinue={() => setAiContOpen(true)}
        onSync={handleSync}
      />

      <div className="flex-1 overflow-auto px-4 py-3">
        {rootNodes.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <AlignLeft className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">还没有大纲节点</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {rootNodes.map(node => (
              <OutlineNode
                key={node.id}
                node={node}
                children={getChildNodes(outlines, node.id)}
                allNodes={outlines}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onAddChild={handleAddChild}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editTarget && (
        <OutlineEditDialog
          target={editTarget}
          projectId={projectId}
          project={project}
          outlines={outlines}
          chapters={chapters}
          characters={characters}
          worldSettings={worldSettings}
          onChange={setEditTarget}
          onClose={() => setEditTarget(null)}
          onCancel={() => { setEditTarget(null); setModuleCtx(null); }}
          onSave={handleSave}
        />
      )}

      <OutlineDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {/* AI 续写大纲对话框 */}
      {aiContOpen && (
        <OutlineContinuationDialog
          projectId={projectId}
          project={project}
          outlines={outlines}
          characters={characters}
          onClose={() => setAiContOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
