import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Chapter, CharacterSyncPreferences } from '@/shared/types';

export type InsertChapterText = (text: string, options?: { characterSync?: CharacterSyncPreferences }) => void | Promise<void>;

export type ModuleType = 'chapter' | 'character' | 'world' | 'outline' | 'thread' | 'timeline';

export interface ModuleContext {
  type: ModuleType;
  label: string;
  // 当前正在编辑的实体 ID
  entityId?: string;
  // 实体的快照数据，供 AI 面板读取
  entitySnapshot?: Record<string, unknown>;
  // AI 生成后应用到字段的回调
  onApplyResult?: (result: string, field?: string) => void;
}

interface EditorContextType {
  // 章节编辑
  currentChapter: Chapter | null;
  setCurrentChapter: (chapter: Chapter | null) => void;
  currentContent: string;
  setCurrentContent: (content: string) => void;
  selectedText: string;
  setSelectedText: (text: string) => void;
  insertCallback: InsertChapterText | null;
  setInsertCallback: React.Dispatch<React.SetStateAction<InsertChapterText | null>>;

  // 模块上下文
  moduleCtx: ModuleContext | null;
  setModuleCtx: (ctx: ModuleContext | null) => void;
}

const EditorContext = createContext<EditorContextType>({
  currentChapter: null,
  setCurrentChapter: () => {},
  currentContent: '',
  setCurrentContent: () => {},
  selectedText: '',
  setSelectedText: () => {},
  insertCallback: null,
  setInsertCallback: () => {},
  moduleCtx: null,
  setModuleCtx: () => {},
});

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentContent, setCurrentContent] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [insertCallback, setInsertCallback] = useState<InsertChapterText | null>(null);
  const [moduleCtx, setModuleCtxState] = useState<ModuleContext | null>(null);

  const setModuleCtx = useCallback((ctx: ModuleContext | null) => {
    setModuleCtxState(ctx);
  }, []);

  return (
    <EditorContext.Provider value={{
      currentChapter, setCurrentChapter,
      currentContent, setCurrentContent,
      selectedText, setSelectedText,
      insertCallback, setInsertCallback,
      moduleCtx, setModuleCtx,
    }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  return useContext(EditorContext);
}
