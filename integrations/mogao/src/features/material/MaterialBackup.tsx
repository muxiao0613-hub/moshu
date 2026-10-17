/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/** 全局素材独立备份与整体恢复；作品备份另带已采用素材，避免混入其他创作的素材。 */
import { useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { getMaterials, importMaterialBackup } from './api';
export function MaterialBackup({ onRestored }: { onRestored: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true); try {
      const materials = (await getMaterials()).map(({ title, rawContent, expandedContent, category, tags }) => ({ title, rawContent, expandedContent, category, tags }));
      await saveAs(new Blob([JSON.stringify({ format: 'mogao-materials', version: 1, materials }, null, 2)], { type: 'application/json' }), `墨稿素材_${new Date().toISOString().slice(0, 10)}.mgao`);
      toast.success(`已备份全部 ${materials.length} 条素材`);
    } catch { toast.error('素材备份失败，请重试'); } finally { setBusy(false); }
  };
  return <><Button size="sm" variant="outline" disabled={busy} onClick={() => void exportAll()}>备份素材库</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>恢复素材</Button>
    <input hidden ref={input} type="file" accept=".mgao,.json" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      setBusy(true); try {
        const result = await importMaterialBackup(JSON.parse(await file.text()));
        await onRestored(); toast.success(`已新增恢复 ${result.count} 条素材`);
      } catch { toast.error('素材恢复失败；请检查备份格式后重试'); } finally { setBusy(false); }
    }} /></>;
}
