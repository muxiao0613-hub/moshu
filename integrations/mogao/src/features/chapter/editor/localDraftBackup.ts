/**
 * 章节草稿的本地备份（localStorage）。
 *
 * 拆分位置：`ChapterEditor.tsx` 已收敛为主容器，保存类副作用由
 * `editor/useChapterEditor.ts` 编排；本模块只回答「备份怎么读写」这一个问题，
 * 让「后端保存失败 → 落本地兜底」的逻辑不必掺进 React 状态。
 * 依赖方向：只依赖浏览器的 localStorage，不依赖任何 feature / React 模块。
 */

/** 上次保存失败时留在浏览器里的草稿。 */
export interface LocalDraftBackup {
  content: string;
  savedAt: string;
}

/** 键里带章节 id：同一浏览器可能同时打开多个项目的稿件。 */
const LOCAL_BACKUP_PREFIX = 'mogao_chapter_backup_';

const backupKey = (chapterId: string) => `${LOCAL_BACKUP_PREFIX}${chapterId}`;

/**
 * 写备份。写失败（配额满 / 隐私模式）只影响兜底能力，不该打断调用方的保存流程，
 * 所以这里吞掉异常；调用方随后会用 toast 告知用户「已存入本地备份」以外的真实结果。
 */
export function writeLocalBackup(chapterId: string, content: string): boolean {
  try {
    localStorage.setItem(backupKey(chapterId), JSON.stringify({ content, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false; // 调用方必须告知作者本地备份不可用，不能声称已经备份。
  }
}

/** 读备份。解析失败按「没有备份」处理，避免一份坏数据让编辑器打不开。 */
export function readLocalBackup(chapterId: string): LocalDraftBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(chapterId));
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || !('content' in value) || !('savedAt' in value)) return null;
    return typeof value.content === 'string' && typeof value.savedAt === 'string'
      ? { content: value.content, savedAt: value.savedAt } : null;
  } catch {
    return null;
  }
}

/** 旧请求返回时不能清除作者在请求期间写下的新草稿。 */
export function clearMatchingBackup(chapterId: string, content: string) {
  if (readLocalBackup(chapterId)?.content === content) clearLocalBackup(chapterId);
}

export function clearLocalBackup(chapterId: string) {
  try {
    localStorage.removeItem(backupKey(chapterId));
  } catch {
    // 清理失败不影响主流程，残留备份会在下次内容一致时被再次清理
  }
}
