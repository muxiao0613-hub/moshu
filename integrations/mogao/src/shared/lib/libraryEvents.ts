/**
 * 作品资料变更广播（章节 / 大纲）。
 *
 * 为什么需要这一层：左栏的章节树、完善台的章节列表、大纲树是**三份各自取数的列表**，
 * 而改动可能发生在任何一个界面里 —— 在编辑器中间改章节名、在完善台删一章、在大纲里
 * 同步章节。没有统一出口时，改完一处别处就一直显示旧数据（用户反馈：
 * 「我在页面中间修改章节名称，左侧的章节名称没有一起变化」）。
 *
 * 做法：**写入口统一广播，列表订阅后重新取数**。
 * - 广播点放在各个 feature 的 `api.ts`（唯一写路径），不在组件里，这样谁来写都会通知到；
 * - 同一 tick 内多次广播合并成一次，避免批量建章时把列表刷爆；
 * - 只有「章节树会显示的字段」变了才广播，正文自动保存不会白刷一次列表。
 */

type Listener = () => void;

/** 合并窗口：批量建章（一次几十个请求）时只让列表刷一次，而不是每个请求刷一次。 */
const COALESCE_MS = 150;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** 订阅资料变更；返回取消订阅函数（在 useEffect 里 return 它即可）。 */
export function onLibraryChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 广播一次变更。窗口内的重复调用会被合并成一次通知。 */
export function emitLibraryChanged(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    for (const fn of [...listeners]) fn();
  }, COALESCE_MS);
}

/** 章节列表里会显示的字段：名称 / 状态点 / 顺序。 */
export interface ChapterListFields {
  title?: string;
  status?: string;
  order?: number;
}

/**
 * 这次保存有没有改动「列表会显示的字段」。
 * 自动保存只带 content / wordCount，这里是 false —— 不惊动列表。
 * 第一次见到某章（新章）返回 true，让列表把它显示出来。
 */
export function chapterListChanged(prev: ChapterListFields | undefined, next: ChapterListFields): boolean {
  if (!prev) return true;
  return prev.title !== next.title || prev.status !== next.status || prev.order !== next.order;
}
