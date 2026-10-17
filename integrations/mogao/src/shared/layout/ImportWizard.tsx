/**
 * 导入向导门面：Dialog 外壳 + 步骤切换的组装（纯展示，不含业务逻辑）。
 *
 * 在拆分中的位置：`shared/layout/ImportWizard.tsx` 是 `import-wizard/` 的唯一对外入口，
 * 状态机在 `import-wizard/useImportWizard.ts`，四个步骤面板与页脚各占一个文件。
 * 依赖方向：`./import-wizard/*` →（本文件）→ ProjectWorkspace / Sidebar。
 */
import { Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { workBase } from '@/shared/lib/workRoutes';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { DoneStep } from './import-wizard/DoneStep';
import { ExtractStep } from './import-wizard/ExtractStep';
import { PreviewStep } from './import-wizard/PreviewStep';
import { StepIndicator } from './import-wizard/StepIndicator';
import { UploadStep } from './import-wizard/UploadStep';
import { WizardFooter } from './import-wizard/WizardFooter';
import { useImportWizard } from './import-wizard/useImportWizard';

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

export function ImportWizard({ open, onClose }: ImportWizardProps) {
  const navigate = useNavigate();
  const wizard = useImportWizard(onClose);
  const { step, detectedChapters, totalWords, extractedMeta, savedProjectId, handleClose } = wizard;

  const enterProject = () => {
    navigate(workBase(savedProjectId));
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent onClose={handleClose} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-ink-500" />
            导入小说文件
          </DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === 'upload' && (
          <UploadStep fileRef={wizard.fileInputRef} onFileSelect={wizard.handleFileSelect} />
        )}

        {step === 'preview' && <PreviewStep wizard={wizard} />}

        {step === 'extract' && extractedMeta && <ExtractStep meta={extractedMeta} />}

        {step === 'done' && (
          <DoneStep chapterCount={detectedChapters.length} totalWords={totalWords} meta={extractedMeta} />
        )}

        <DialogFooter>
          <WizardFooter wizard={wizard} onEnterProject={enterProject} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
