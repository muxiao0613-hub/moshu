/**
 * 导入向导的页脚按钮：按当前步骤给出「取消 / 重新选择 / AI 提取 / 直接导入 / 确认导入 / 进入项目」。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `shared/layout/ImportWizard.tsx`；
 * 跳转动作由门面注入（本组件不碰路由）。
 * 依赖方向：`./useImportWizard` →（本文件）→ 门面。
 */
import { AlignLeft, BookOpen, Check, ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ImportWizardState } from './useImportWizard';

interface WizardFooterProps {
  wizard: ImportWizardState;
  /** 进入刚导入的项目（门面里用 navigate(workBase(id)) 实现）。 */
  onEnterProject: () => void;
}

export function WizardFooter({ wizard, onEnterProject }: WizardFooterProps) {
  const {
    step, setStep, handleClose, handleExtract, handleSave,
    extractMeta, extracting, saving, projectTitle,
  } = wizard;

  return (
    <>
      {step === 'upload' && (
        <Button variant="outline" onClick={handleClose}>取消</Button>
      )}

      {step === 'preview' && (
        <>
          <Button variant="outline" onClick={() => setStep('upload')} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" />重新选择
          </Button>
          {extractMeta ? (
            <Button onClick={handleExtract} disabled={extracting || !projectTitle.trim()} className="gap-1.5">
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlignLeft className="h-3.5 w-3.5" />}
              {extracting ? 'AI 分析中...' : 'AI 提取设定'}
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving || !projectTitle.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
              {saving ? '导入中...' : '直接导入'}
            </Button>
          )}
        </>
      )}

      {step === 'extract' && (
        <>
          <Button variant="outline" onClick={() => setStep('preview')} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" />返回
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? '导入中...' : '确认导入'}
          </Button>
        </>
      )}

      {step === 'done' && (
        <>
          <Button variant="outline" onClick={handleClose}>关闭</Button>
          <Button onClick={onEnterProject} className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />进入项目
          </Button>
        </>
      )}
    </>
  );
}
