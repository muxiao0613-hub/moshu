/**
 * 用户菜单的配色：浅色＝暖咖（与顶栏一致），深色＝青瓷夜色。
 *
 * 在拆分中的位置：纯函数，对外门面是 `shared/layout/UserMenu.tsx`，
 * 门面把这份主题同时用于下拉外壳与 `ProfileHeader`。
 * 依赖方向：（本文件）→ 门面/ProfileHeader，不依赖任何 React 运行时。
 */

/** 用户菜单/个人设置弹窗用到的全部颜色 token。 */
export interface UserMenuTheme {
  menuBg: string;
  menuBorder: string;
  menuHead: string;
  menuHeadBorder: string;
  itemText: string;
  itemIcon: string;
  divider: string;
  avatar: string;
  avatarText: string;
  avatarBorder: string;
  dlgHead: string;
  emailIcon: string;
  emailText: string;
}

export function buildUserMenuTheme(isDark: boolean): UserMenuTheme {
  return isDark
    ? {
        menuBg: 'rgba(10,10,20,0.97)', menuBorder: 'rgba(78,216,212,0.2)',
        menuHead: 'linear-gradient(135deg, rgba(30,20,8,0.9) 0%, rgba(15,15,28,0.9) 100%)', menuHeadBorder: 'rgba(78,216,212,0.15)',
        itemText: 'rgba(78,216,212,0.75)', itemIcon: 'rgba(78,216,212,0.5)', divider: 'rgba(78,216,212,0.12)',
        avatar: 'linear-gradient(135deg, #2ab8b4, #1a7a78)', avatarText: '#052020', avatarBorder: 'rgba(78,216,212,0.3)',
        dlgHead: 'linear-gradient(135deg, #051818 0%, #051414 40%, #0a0a14 100%)',
        emailIcon: 'rgba(78,216,212,0.6)', emailText: 'rgba(78,216,212,0.8)',
      }
    : {
        menuBg: 'rgba(43,36,28,0.98)', menuBorder: 'rgba(150,110,60,0.3)',
        menuHead: 'linear-gradient(135deg, #3a2e1e 0%, #2b241c 100%)', menuHeadBorder: 'rgba(150,110,60,0.2)',
        itemText: '#dcc8a2', itemIcon: '#b89a64', divider: 'rgba(150,110,60,0.18)',
        avatar: 'linear-gradient(135deg, #d99a3a, #b45309)', avatarText: '#fff8ec', avatarBorder: 'rgba(217,154,58,0.4)',
        dlgHead: 'linear-gradient(135deg, #2b241c 0%, #3a2e1e 45%, #241d14 100%)',
        emailIcon: '#d8b87e', emailText: '#e8dcc4',
      };
}
