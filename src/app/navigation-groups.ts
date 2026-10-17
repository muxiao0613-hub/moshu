import type {Page, Preferences} from '../contracts';

export const navigationGroups = [
  {id:'home',label:'首页',description:'今日与最近',first:'home',pages:['home']},
  {id:'work',label:'工作',description:'项目与任务',first:'projects',pages:['projects','tasks']},
  {id:'knowledge',label:'资料',description:'资料库与笔记',first:'resources',pages:['resources','notes','document']},
  {id:'creation',label:'创作',description:'墨稿与模块',first:'modules',pages:['modules','module']},
  {id:'tools',label:'工具',description:'桌宠与空间管理',first:'pet',pages:['pet','search','trash','settings','help']},
] as const;
export function groupForPage(page:Page) {
  return navigationGroups.find(group=>(group.pages as readonly Page[]).includes(page)) ?? navigationGroups[0];
}
export function groupPages(preferences:Preferences,page:Page):Page[] {
  const group=groupForPage(page);
  const pages=preferences.navigation.filter(key=>(group.pages as readonly Page[]).includes(key));
  const ordered=[...pages.filter(key=>preferences.pinned.includes(key)),...pages.filter(key=>!preferences.pinned.includes(key))];
  return group.id==='tools'?['pet',...ordered]:ordered;
}
