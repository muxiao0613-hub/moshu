/**
 * 作品库的静态配置：类型/平台选项、封面配色、表单初值。
 *
 * 在拆分中的位置：纯常量叶子，对外门面是 `features/project/ProjectList.tsx`，
 * 只被 `list/` 下的表单与网格组件引用。
 * 依赖方向：`@/shared/lib/storyRules`（短篇平台规则的口径来源，与 ShortStoryWorkspace 同一份配置）
 *           + `./types` →（本文件）→ list/* 组件。
 */
import { PLATFORM_CONFIGS } from '@/shared/lib/storyRules';
import type { StoryGenre, StoryPlatform } from '@/shared/types';
import type { NovelFormValue, StoryFormValue } from './types';

/** 长篇类型下拉选项（同时用作封面配色的键）。 */
export const GENRES = ['玄幻', '奇幻', '仙侠', '武侠', '科幻', '言情', '都市', '历史', '悬疑', '恐怖', '其他'];

/** 长篇类型 → 封面渐变类名；未知类型回落到「其他」。 */
export const GENRE_COVER: Record<string, { bg: string }> = {
  '玄幻': { bg: 'bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-900' },
  '奇幻': { bg: 'bg-gradient-to-br from-violet-600 via-fuchsia-600 to-violet-900' },
  '仙侠': { bg: 'bg-gradient-to-br from-cyan-500 via-teal-600 to-cyan-900' },
  '武侠': { bg: 'bg-gradient-to-br from-red-700 via-rose-600 to-red-900' },
  '科幻': { bg: 'bg-gradient-to-br from-blue-600 via-sky-500 to-blue-900' },
  '言情': { bg: 'bg-gradient-to-br from-pink-500 via-rose-400 to-pink-800' },
  '都市': { bg: 'bg-gradient-to-br from-zinc-600 via-slate-500 to-zinc-800' },
  '历史': { bg: 'bg-gradient-to-br from-amber-700 via-yellow-600 to-amber-900' },
  '悬疑': { bg: 'bg-gradient-to-br from-gray-700 via-slate-600 to-gray-900' },
  '恐怖': { bg: 'bg-gradient-to-br from-red-900 via-gray-800 to-black' },
  '其他': { bg: 'bg-gradient-to-br from-zinc-500 via-zinc-600 to-zinc-800' },
};

/** 短篇目标平台下拉选项。 */
export const SHORT_STORY_PLATFORMS: StoryPlatform[] = ['小红书故事', '知乎盐选', '公众号', '纯文学', '自由创作'];

/** 短篇故事类型下拉选项。 */
export const SHORT_STORY_GENRES: StoryGenre[] = ['情感', '悬疑推理', '都市', '科幻', '恐怖', '微小说', '其他'];

/** 按类型给出「一句话核心」示例，新建短篇时可一键填入。 */
export const PREMISE_EXAMPLES: Record<StoryGenre, string[]> = {
  情感: [
    '离婚当天，我发现前夫每年都给一个陌生孩子寄生日礼物。',
    '母亲去世后，我在她的旧手机里收到一条未来三天后的短信。',
  ],
  悬疑推理: [
    '我搬进凶宅第一晚，发现墙上的合照每天都会多出一个人。',
    '同学会结束后，群里所有人都声称没见过那个坐在主位的人。',
  ],
  都市: [
    '我替老板送一份辞退通知，却发现收件人正是三年前救过我的人。',
    '凌晨两点，我接到自己的外卖订单，地址是已经拆掉的老家。',
  ],
  科幻: [
    '城市实行记忆配额后，我必须删掉一个人，才能保留自己的工作。',
    'AI 法官判我无罪，但它要求我亲手证明自己仍然是人。',
  ],
  恐怖: [
    '奶奶临终前说不要打开床底的木箱，可葬礼当晚箱子自己响了。',
    '我家的门禁记录显示，每晚三点都有一个"我"回家。',
  ],
  微小说: [
    '我每天给失踪的父亲发消息，今天他回了一个"别报警"。',
    '她把婚戒扔进河里，第二天鱼贩从鱼肚子里把它还给了我。',
  ],
  其他: [
    '主角在一天之内被迫面对一个秘密，并做出无法反悔的选择。',
    '一个普通人收到一件不该存在的旧物，由此发现身边关系全是伪装。',
  ],
};

/** 长篇新建/编辑表单初值（创建成功后复位到同一份口径，见门面的 handleCreate）。 */
export const EMPTY_NOVEL_FORM: NovelFormValue = { title: '', genre: '玄幻', synopsis: '' };

/** 短篇新建表单初值：目标字数取「小红书故事」的推荐值。 */
export const EMPTY_STORY_FORM: StoryFormValue = {
  title: '',
  platform: '小红书故事',
  genre: '情感',
  premise: '',
  targetWords: PLATFORM_CONFIGS['小红书故事'].defaultWords,
};
