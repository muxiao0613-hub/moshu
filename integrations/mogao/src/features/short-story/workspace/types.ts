/**
 * 短篇写作台 · 共享类型：面板/画布状态枚举、编辑器与抽屉实例类型，以及生成 hook 的对外 API 形状。
 *
 * 在拆分中的位置：workspace/* 的最底层，被两个 hook 与各展示面板共用；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：只依赖 react / @tiptap/react / @/shared/lib/useDrawerSwipe / @/shared/types，
 * 不依赖 workspace 内其它模块。
 */
import type { Dispatch, SetStateAction } from 'react';
import type { useEditor } from '@tiptap/react';
import type { useDrawerSwipe } from '@/shared/lib/useDrawerSwipe';
import type { ShortStoryQualityReport } from '@/shared/types';

export type SaveState  = 'saved' | 'unsaved' | 'saving';
export type PanelTab   = 'full' | 'continue' | 'rewrite' | 'review';
export type ResultMode = 'full' | 'continue' | 'selection' | null;
export type Canvas     = 'idle' | 'streaming' | 'done';

/** tiptap 编辑器实例（与 useEditor 返回值同口径，避免各文件各自推导） */
export type TipTapEditor = ReturnType<typeof useEditor>;
/** 左右抽屉滑动手势（与 useDrawerSwipe 返回值同口径） */
export type DrawerSwipe = ReturnType<typeof useDrawerSwipe>;

/** useStoryGeneration 对外暴露的状态与动作集合（面板通过它读写生成流程，避免层层透传） */
export interface StoryGenerationApi {
  tab: PanelTab; setTab: Dispatch<SetStateAction<PanelTab>>;
  loading: string | null;
  error: string; setError: Dispatch<SetStateAction<string>>;
  canvas: Canvas;
  streamText: string;
  resultText: string;
  resultMode: ResultMode;
  streamLabel: string;
  continueInstr: string; setContinueInstr: Dispatch<SetStateAction<string>>;
  rewriteInstr: string; setRewriteInstr: Dispatch<SetStateAction<string>>;
  qualityReport: ShortStoryQualityReport | null;
  copied: string | null;
  expandedPt: string | null; setExpandedPt: Dispatch<SetStateAction<string | null>>;
  styleOpen: boolean; setStyleOpen: Dispatch<SetStateAction<boolean>>;
  openings: string[]; setOpenings: Dispatch<SetStateAction<string[]>>;
  chosenIdx: number | null; setChosenIdx: Dispatch<SetStateAction<number | null>>;
  openingsLoading: boolean;
  craftOpen: boolean; setCraftOpen: Dispatch<SetStateAction<boolean>>;
  revisionInstr: string; setRevisionInstr: Dispatch<SetStateAction<string>>;
  endings: string[];
  clearCanvas: () => void;
  insertResult: (text: string, replace?: boolean) => void;
  copyText: (text: string, key: string) => void;
  handleOneClickFullDraft: () => Promise<void>;
  handleGenerateStructure: () => Promise<void>;
  handleEnhancePremise: () => Promise<void>;
  handleGenerateOpenings: () => Promise<void>;
  handleGenerateFull: (skipOpening?: boolean) => Promise<void>;
  handleContinue: () => Promise<void>;
  handleRewrite: () => Promise<void>;
  handleReview: () => Promise<void>;
  handleGenerateEndings: () => Promise<void>;
  handleReviseFull: () => Promise<void>;
  handleCompleteToTarget: () => Promise<void>;
  handlePublishReadyRevise: () => Promise<void>;
}
