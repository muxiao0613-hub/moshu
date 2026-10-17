// 平台与结构规则（原 features/short-story/shortStoryTemplates.ts）
//
// 为什么放在 shared：短篇不再有独立编辑器（REFACTOR_PLAN.md §6.2），
// 这些规则是**长篇写作台也要用**的资产 —— 平台约束、结构模板、格式校验正则层。
// 放在 shared 之后，写作台与短篇页面引用同一份实现，不会各自漂移。
// features/short-story/shortStoryTemplates.ts 现在是本文件的兼容转发层。
import type { StoryPlatform, StoryGenre, StoryPlotPoint } from '@/shared/types';

// ─── 平台配置 ─────────────────────────────────────────────────────────────────

export interface PlatformConfig {
  label: StoryPlatform;
  color: string;
  wordRange: [number, number];
  defaultWords: number;
  tone: string;
  rules: string[];
  forbidden: string[];
}

export const PLATFORM_CONFIGS: Record<StoryPlatform, PlatformConfig> = {
  '小红书故事': {
    label: '小红书故事',
    color: '#ff2442',
    wordRange: [1200, 2800],
    defaultWords: 1800,
    tone: '亲切口语化，第一人称叙事感强，有代入感',
    rules: [
      '第一句必须是悬念句、反常动作或关系冲突，不从背景介绍开始',
      '段落不超过 3 行，保持手机阅读节奏',
      '每 400-600 字有一个情绪推进节点或信息反转',
      '结尾必须回收一个前文物件/台词/动作，形成情绪回声',
    ],
    forbidden: ['大段景物描写', '学术性词汇', '过于复杂的背景铺垫'],
  },
  '知乎盐选': {
    label: '知乎盐选',
    color: '#0084ff',
    wordRange: [4000, 8000],
    defaultWords: 5000,
    tone: '文学性强，叙事克制，喜欢真实感和细节质感',
    rules: [
      '允许适当慢热，但前 500 字必须建立持续疑问或复杂关系',
      '对话要有个人风格和潜台词，避免只传递信息',
      '可以使用非线性叙事，但每次跳转要有清晰时间/物件锚点',
      '结尾留白，但必须让前文细节产生新意义',
    ],
    forbidden: ['套路化反转', '过于脸谱化的人物'],
  },
  '公众号': {
    label: '公众号',
    color: '#07c160',
    wordRange: [2500, 6000],
    defaultWords: 3500,
    tone: '适合碎片阅读，节奏感强，情感共鸣度高',
    rules: [
      '每 500-800 字一个小高潮、悬念节点或新证据',
      '小标题辅助分割（可选），但小标题必须短且有悬念',
      '开头 200 字必须给出核心悬念或强情绪触发点',
      '结尾留下可传播的情绪钩子，但不生硬说教',
    ],
    forbidden: ['冗长铺垫', '内容密度过低的段落'],
  },
  '纯文学': {
    label: '纯文学',
    color: '#8b5cf6',
    wordRange: [5000, 12000],
    defaultWords: 7000,
    tone: '注重文字本身的质感，意象、留白、叙事视角的克制',
    rules: [
      '语言精炼，每个意象都必须服务人物处境',
      '外部事件可以轻，但人物内心位移必须清楚',
      '可以弱化情节，但必须保留内在张力和关系裂缝',
      '结构可以碎片化，但结尾需形成意象或动作回声',
    ],
    forbidden: ['廉价反转', '说教式结尾', '过度解释主题'],
  },
  '自由创作': {
    label: '自由创作',
    color: '#6b7280',
    wordRange: [1200, 12000],
    defaultWords: 4000,
    tone: '不受平台限制，自由发挥',
    rules: [],
    forbidden: [],
  },
};

// ─── 故事结构模板 ──────────────────────────────────────────────────────────────

export interface StructureTemplate {
  id: string;
  label: string;
  desc: string;
  suitableFor: StoryGenre[];
  points: Omit<StoryPlotPoint, 'id' | 'content'>[];
}

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    id: 'three_act',
    label: '三幕结构',
    desc: '经典叙事框架，适合大多数类型',
    suitableFor: ['情感', '都市', '科幻', '其他'],
    points: [
      { label: '开局钩子', hint: '前 3 句话制造悬念/冲突/反常，抓住读者', order: 1 },
      { label: '核心冲突建立', hint: '主角面临的核心处境或问题是什么', order: 2 },
      { label: '升级与转折', hint: '冲突升级，出现意外变量或新信息', order: 3 },
      { label: '高潮', hint: '最大冲突点，最重要的选择或对抗', order: 4 },
      { label: '结尾共鸣', hint: '呼应开头，余韵或反转，让读者有回味', order: 5 },
    ],
  },
  {
    id: 'mystery',
    label: '悬疑解构',
    desc: '谜题→错误线索→真相反转',
    suitableFor: ['悬疑推理'],
    points: [
      { label: '谜题抛出', hint: '开篇就给出核心谜题，让读者想知道答案', order: 1 },
      { label: '初步调查/误导', hint: '表面线索指向错误方向，建立错误预期', order: 2 },
      { label: '线索堆叠', hint: '累积细节，不动声色地埋下真相的碎片', order: 3 },
      { label: '真相反转', hint: '用已有的线索揭示出人意料但合理的答案', order: 4 },
      { label: '余韵回响', hint: '真相揭露后，让读者重新理解前文的某个细节', order: 5 },
    ],
  },
  {
    id: 'emotional',
    label: '情感共鸣',
    desc: '最适合小红书/公众号的情感向结构',
    suitableFor: ['情感', '都市'],
    points: [
      { label: '反常开局', hint: '一个违背常识或让人意外的生活瞬间', order: 1 },
      { label: '情境铺垫', hint: '交代背景，建立读者对主角的共情', order: 2 },
      { label: '情感爆点', hint: '最触动的核心场景，细节要具体', order: 3 },
      { label: '内心转变', hint: '主角经历这件事后的认知或态度变化', order: 4 },
      { label: '意外收尾', hint: '一个出人意料但让人感到温暖或刺痛的结尾', order: 5 },
    ],
  },
  {
    id: 'one_scene_echo',
    label: '单场景回声',
    desc: '一个场景、一段关系、一个物件回收，适合短小但有后劲的故事',
    suitableFor: ['微小说', '情感', '都市'],
    points: [
      { label: '场景压力', hint: '直接进入一个有压力的具体场面', order: 1 },
      { label: '表层目标', hint: '主角此刻想完成什么小事', order: 2 },
      { label: '潜台词对抗', hint: '通过对话或动作暴露真正矛盾', order: 3 },
      { label: '细节反转', hint: '一个物件/台词改变读者理解', order: 4 },
      { label: '回声收束', hint: '用同一物件/动作收尾，形成余韵', order: 5 },
    ],
  },
  {
    id: 'flash',
    label: '微小说',
    desc: '单一场景、一个反转、500-1500字',
    suitableFor: ['微小说'],
    points: [
      { label: '单一场景切入', hint: '直接进入一个具体的场景和时刻', order: 1 },
      { label: '核心张力', hint: '场景中暗含的矛盾或紧张关系', order: 2 },
      { label: '认知反转', hint: '结尾用一句话或一个细节颠覆读者对前文的理解', order: 3 },
    ],
  },
  {
    id: 'speculative_dilemma',
    label: '科幻困境',
    desc: '设定不是炫技，而是逼迫人物做选择',
    suitableFor: ['科幻'],
    points: [
      { label: '异常设定切入', hint: '从一个反常日常开始，让设定通过生活细节出现', order: 1 },
      { label: '人物欲望绑定设定', hint: '主角为什么必须利用/反抗这个设定', order: 2 },
      { label: '规则代价显现', hint: '设定带来具体代价，不能只做概念说明', order: 3 },
      { label: '伦理/关系选择', hint: '主角在利益、关系、身份或记忆之间做选择', order: 4 },
      { label: '设定回声', hint: '结尾用一个细节让读者重新理解设定与人', order: 5 },
    ],
  },
  {
    id: 'horror',
    label: '恐怖/悬疑气氛',
    desc: '氛围渐进式营造',
    suitableFor: ['恐怖'],
    points: [
      { label: '正常世界', hint: '先建立"正常"，让读者放松警惕', order: 1 },
      { label: '第一个异常', hint: '一个微小但让人不安的细节，不解释', order: 2 },
      { label: '异常升级', hint: '越来越多无法解释的事，恐惧感累积', order: 3 },
      { label: '真相/爆发', hint: '恐惧的本质揭示，或高潮冲突', order: 4 },
      { label: '余震', hint: '结尾留下无法消除的不安感或开放性恐惧', order: 5 },
    ],
  },
];

export function getTemplateForGenre(genre: StoryGenre): StructureTemplate {
  const preferred: Partial<Record<StoryGenre, string>> = {
    '悬疑推理': 'mystery',
    '情感': 'emotional',
    '都市': 'emotional',
    '科幻': 'speculative_dilemma',
    '恐怖': 'horror',
    '微小说': 'one_scene_echo',
    '其他': 'three_act',
  };
  return (
    STRUCTURE_TEMPLATES.find(t => t.id === preferred[genre]) ||
    STRUCTURE_TEMPLATES.find(t => t.suitableFor.includes(genre)) ||
    STRUCTURE_TEMPLATES[0]
  );
}

// ─── 类型配置 ──────────────────────────────────────────────────────────────────

export const GENRE_CONFIGS: Record<StoryGenre, { color: string; emoji: string }> = {
  '悬疑推理': { color: '#1e40af', emoji: '🔍' },
  '情感':     { color: '#be185d', emoji: '💫' },
  '都市':     { color: '#0891b2', emoji: '🏙️' },
  '科幻':     { color: '#6d28d9', emoji: '🚀' },
  '恐怖':     { color: '#dc2626', emoji: '👁️' },
  '微小说':   { color: '#059669', emoji: '✨' },
  '其他':     { color: '#6b7280', emoji: '📝' },
};

// ─── 平台格式快检（规则层，无需 API）─────────────────────────────────────────

export interface FormatIssue {
  type: 'error' | 'warning' | 'ok';
  label: string;
  detail: string;
}

export function checkPlatformFormat(content: string, platform: StoryPlatform, wordCount: number): FormatIssue[] {
  const text = content.replace(/<[^>]*>/g, '').trim();
  const config = PLATFORM_CONFIGS[platform];
  const issues: FormatIssue[] = [];

  if (platform === '自由创作') return [];

  // 字数检查
  const [minW, maxW] = config.wordRange;
  if (wordCount < Math.floor(minW * 0.7)) {
    issues.push({ type: 'warning', label: '明显未完成', detail: `当前 ${wordCount} 字，距离建议区间 ${minW}-${maxW} 字较远，建议继续扩写或重新生成全文` });
  } else if (wordCount < minW) {
    issues.push({ type: 'warning', label: '字数略少', detail: `当前 ${wordCount} 字，建议 ${minW}-${maxW} 字；若是微小说可接受，否则建议扩写关键场景` });
  } else if (wordCount > maxW) {
    issues.push({ type: 'warning', label: '字数偏多', detail: `当前 ${wordCount} 字，建议控制在 ${maxW} 字以内` });
  } else {
    issues.push({ type: 'ok', label: '字数合适', detail: `${wordCount} 字，符合 ${platform} 要求` });
  }

  // 小红书：段落长度检查
  if (platform === '小红书故事') {
    const paragraphs = content.split(/<\/p>/i).filter(p => p.trim().length > 50);
    const longParas = paragraphs.filter(p => p.replace(/<[^>]*>/g, '').length > 150);
    if (longParas.length > 2) {
      issues.push({ type: 'warning', label: '段落过长', detail: `有 ${longParas.length} 个段落超过 150 字，小红书建议段落简短` });
    } else {
      issues.push({ type: 'ok', label: '段落节奏', detail: '段落长度适合小红书阅读' });
    }
  }

  // 开头钩子检查（通用）
  const opening = text.slice(0, 80);
  const hasHook = /[？！?!]|突然|原来|没想到|竟然|居然|直到那天|那一刻|我以为/.test(opening);
  if (!hasHook && platform !== '纯文学') {
    issues.push({ type: 'warning', label: '开头钩子弱', detail: '开头 80 字未检测到悬念信号，建议用反常或疑问句开局' });
  } else if (hasHook) {
    issues.push({ type: 'ok', label: '开头有钩子', detail: '检测到悬念或冲突信号' });
  }

  // 对话检查
  const dialogueCount = (text.match(/[""「」『』]/g) || []).length;
  if (dialogueCount < 4 && wordCount > 2000 && platform !== '纯文学') {
    issues.push({ type: 'warning', label: '对话偏少', detail: '几乎没有对话，故事可能缺乏活力' });
  }

  // 具体细节密度检查：声音/气味/触感/光线/物件/身体动作
  const sensoryHits = (text.match(/灯|光|影|风|雨|烟|味|气味|潮|冷|热|烫|冰|粗糙|玻璃|钥匙|手机|门|杯|纸|鞋|衣角|手指|喉咙|呼吸|脚步|铃声|电梯|窗/g) || []).length;
  if (wordCount > 1200 && sensoryHits < Math.max(4, Math.floor(wordCount / 900))) {
    issues.push({ type: 'warning', label: '细节密度偏低', detail: '具体物件、声音、触感或场景锚点偏少，容易显得像概述' });
  } else if (wordCount > 800) {
    issues.push({ type: 'ok', label: '细节密度', detail: '检测到一定数量的场景/物件细节' });
  }

  // AI 味风险：抽象情绪词过密但动作词不足
  const abstractHits = (text.match(/命运|救赎|释怀|成长|破碎|温暖|治愈|崩溃|绝望|痛苦|难过|悲伤|幸福|孤独|遗憾|明白了|放下了/g) || []).length;
  const actionHits = (text.match(/推|拉|拿|放|捏|攥|递|转身|低头|抬头|停下|走|跑|笑|问|看|敲|关上|打开|按下|退后|靠近/g) || []).length;
  if (wordCount > 1000 && abstractHits > actionHits * 0.7) {
    issues.push({ type: 'warning', label: '抽象情绪偏多', detail: '情绪词多于动作和细节，建议把"难过/释怀"改成具体行为' });
  }

  // 结尾回声检查
  const ending = text.slice(-160);
  if (wordCount > 1000) {
    const echoSignals = /又|还是|那只|那张|那句|那天|门口|手机|钥匙|灯|雨|杯|纸|照片|声音|回头|放回|收起|没再/.test(ending);
    if (!echoSignals) {
      issues.push({ type: 'warning', label: '结尾回收弱', detail: '结尾没有明显回收前文物件、台词或动作，余韵可能不足' });
    }
  }

  return issues;
}

// ─── 结构模板 → 提示词片段 ────────────────────────────────────────────────────

/**
 * 把结构模板整理成给模型的「结构约束」块。
 * 用途：写作台「AI 排场景」时把模板的点位约束压进节拍卡提示词，
 * 让节拍卡/场景卡按模板的形状展开，而不是每次都由模型自由发挥。
 */
export function buildTemplateHint(template: StructureTemplate | undefined | null): string {
  if (!template) return '';
  const points = [...template.points]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p, i) => `${i + 1}. ${p.label}：${p.hint ?? ''}`.trim())
    .join('\n');
  return `\n结构模板：${template.label}（${template.desc}）
本章的 beats 必须按这个模板的骨架展开，节点数量与模板点位一一对应：
${points}`;
}
