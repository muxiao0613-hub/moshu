/**
 * 写作台 / 完善台路由的**单点定义**（见 REFACTOR_PLAN.md §3.2）。
 *
 * 重构后写作台的规范路由是 `/work/:id`；旧的 `/project/:id/*` 由 App.tsx 统一重定向过来，
 * 因此内部导航一律用这里的函数拼路径，不要再手写 `/project/...` 字面量。
 */

export function workBase(projectId: string): string {
  return `/work/${projectId}`;
}

export function workChapterPath(projectId: string, chapterId: string): string {
  return `${workBase(projectId)}/chapter/${chapterId}`;
}

/**
 * 完善台：设定（人物/世界观/大纲/伏笔/章节列表）+ 体检（一致性/AI 味/节奏/评审/批量体检）。
 *
 * 它由「诊疗台 + 高级面板」合并而来：这两处回答的是同一个问题（这本书整体对不对），
 * 而写作台右栏要回答的是「这一章 AI 看到了什么」——两件事分开，写作时才不会被设定表单挤占。
 */
export function workRefinePath(projectId: string, tab?: string): string {
  return tab ? `${workBase(projectId)}/refine/${tab}` : `${workBase(projectId)}/refine`;
}

/**
 * @deprecated 诊疗台已并入完善台（REFACTOR_PLAN.md §5 → 完善台）。
 * 保留这个函数只为兼容外部链接与历史代码，新代码请用 `workRefinePath`。
 */
export function workClinicPath(projectId: string, tab?: string): string {
  return workRefinePath(projectId, tab);
}

/**
 * @deprecated 原「高级」面板已删除（它的内容就是完善台的设定/体检视图）。
 * 旧段名仍映射到完善台对应标签，保证老书签可用。
 */
export function workAdvancedPath(projectId: string, section?: string): string {
  return workRefinePath(projectId, section ? advancedSectionTab(section) : undefined);
}

/** 旧「高级」段名 → 完善台标签（两处口径只此一份）。 */
function advancedSectionTab(section: string): string | undefined {
  switch (section) {
    case 'chapters':
    case 'characters':
    case 'world':
    case 'outline':
    case 'threads':
      return section;
    case 'quality':
      return 'review';
    default:
      return undefined;
  }
}

/**
 * 社区作品详情页。
 *
 * 它原来在 `/work/:type/:id`，与写作台 `/work/:id/*` 是**前缀冲突**的：
 * 实测 react-router 的排序里 `/work/:id/*` 胜出，会把 `/work/novel/xxx` 吞进写作台。
 * 因此社区侧迁到 `/square/work/:type/:id`（REFACTOR_PLAN.md §7.1：社区侧独立入口）。
 */
export function squareWorkPath(type: string, id: string): string {
  return `/square/work/${type}/${id}`;
}

/**
 * 旧工作区子路径段 → 重构后的规范路径（REFACTOR_PLAN.md §7.1）。
 * 旧地址兼容层（App.tsx）与「使用说明」里的快捷入口共用这一份映射，避免两处口径漂移。
 */
export function legacySectionPath(projectId: string, section?: string, param?: string): string {
  switch (section) {
    case 'chapter':
      return param ? workChapterPath(projectId, param) : workBase(projectId);
    case 'quality':
      return workRefinePath(projectId, 'review');
    case 'threads':
      // 第 3 批：伏笔线索独立页 → 诊疗台的「伏笔回收」看板；第 6 批随完善台合并到 refine
      return workRefinePath(projectId, 'threads');
    case 'timeline':
      // 第 3 批：时间线独立页已删（数据与函数保留）
      return workRefinePath(projectId, 'threads');
    case 'characters':
    case 'world':
    case 'outline':
      return workRefinePath(projectId, section);
    case 'guide':
      // 第 4 批：独立「使用说明」页已删，内容并入首次引导与「设置 → 风格样本」
      return workBase(projectId);
    default:
      return workBase(projectId); // '' / chapters / 其他一律回到写作台
  }
}
