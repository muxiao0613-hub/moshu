/**
 * 导入向导的状态机：上传读取 → 章节预览 →（可选）AI 提取设定 → 落库完成。
 *
 * 在拆分中的位置：唯一的 hook，对外门面是 `shared/layout/ImportWizard.tsx`，
 * 门面只负责 Dialog 外壳与步骤/页脚的组装。取文本处理走 `parsers.ts`，落库走 `importRunner.ts`。
 * 依赖方向：`./parsers`、`./importRunner` →（本文件）→ 门面与步骤组件；不依赖任何 UI 组件。
 */
import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import type { DetectedChapter } from '@/shared/lib/chapterSplitter';
import { persistImportedNovel } from './importRunner';
import { buildExtractionSample, canPersist, parseExtractedMeta, parseNovelFile } from './parsers';
import type { ExtractedMeta, Step } from './types';

/** 门面与步骤组件需要的全部状态与动作。 */
export interface ImportWizardState {
  step: Step;
  fileName: string;
  projectTitle: string;
  genre: string;
  detectedChapters: DetectedChapter[];
  detectionMethod: string;
  totalWords: number;
  extractMeta: boolean;
  extracting: boolean;
  extractError: string;
  extractedMeta: ExtractedMeta | null;
  saving: boolean;
  savedProjectId: string;
  fileInputRef: RefObject<HTMLInputElement>;
  setProjectTitle: (value: string) => void;
  setGenre: (value: string) => void;
  setExtractMeta: (value: boolean) => void;
  setStep: (step: Step) => void;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleExtract: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleClose: () => void;
}

export function useImportWizard(onClose: () => void): ImportWizardState {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [detectedChapters, setDetectedChapters] = useState<DetectedChapter[]>([]);
  const [detectionMethod, setDetectionMethod] = useState('');
  const [totalWords, setTotalWords] = useState(0);
  const [projectTitle, setProjectTitle] = useState('');
  const [genre, setGenre] = useState('玄幻');
  const [extractMeta, setExtractMeta] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedMeta, setExtractedMeta] = useState<ExtractedMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState('');

  const reset = () => {
    setStep('upload');
    setFileName('');
    setRawText('');
    setDetectedChapters([]);
    setDetectionMethod('');
    setTotalWords(0);
    setProjectTitle('');
    setGenre('玄幻');
    setExtractMeta(false);
    setExtracting(false);
    setExtractError('');
    setExtractedMeta(null);
    setSaving(false);
    setSavedProjectId('');
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Step 1: 文件读取 ──────────────────────────────────────────────────────

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const text = await file.text();
    setRawText(text);

    const parsed = parseNovelFile(file.name, text);
    setDetectedChapters(parsed.chapters);
    setDetectionMethod(parsed.detectionMethod);
    setTotalWords(parsed.totalWords);

    // 用文件名推断书名
    setProjectTitle(parsed.title);

    setStep('preview');
  };

  // ── Step 2: AI 提取设定（可选）────────────────────────────────────────────

  const handleExtract = async () => {
    if (!rawText) return;
    setExtracting(true);
    setExtractError('');
    try {
      const { getClient, getSettings } = await import('@/features/ai/aiService');
      const { model } = getSettings();

      // 取前5章内容作为分析样本
      const sample = buildExtractionSample(detectedChapters);

      const client = getClient(); // 自带 Key / 平台托管 双模式

      const resp = await client.chat.completions.create({
        model,
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: '你是小说内容分析员。从提供的章节中提取人物、世界观和内容概要。只输出纯JSON，不要markdown。',
          },
          {
            role: 'user',
            content: `分析以下小说《${projectTitle}》的前几章，提取核心设定。

${sample}

只输出JSON：
{
  "characters": [{"name":"人物名","role":"protagonist|antagonist|supporting|minor","personality":"性格60字内","background":"背景60字内"}],
  "worldSettings": [{"category":"分类","title":"设定名","content":"内容100字内"}],
  "outlineSummary": "整体故事梗概100字内"
}`,
          },
        ],
      });

      const text = resp.choices[0]?.message?.content || '';
      // 简单解析 JSON
      setExtractedMeta(parseExtractedMeta(text));
      setStep('extract');
    } catch (e) {
      setExtractError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  // ── Step 3: 保存到数据库 ──────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canPersist(projectTitle, detectedChapters)) return;
    setSaving(true);
    try {
      const projectId = await persistImportedNovel({
        title: projectTitle.trim(),
        genre,
        chapters: detectedChapters,
        meta: extractedMeta,
      });
      setSavedProjectId(projectId);
      setStep('done');
    } catch (e) {
      setExtractError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return {
    step, fileName, projectTitle, genre, detectedChapters, detectionMethod, totalWords,
    extractMeta, extracting, extractError, extractedMeta, saving, savedProjectId, fileInputRef,
    setProjectTitle, setGenre, setExtractMeta, setStep,
    handleFileSelect, handleExtract, handleSave, handleClose,
  };
}
