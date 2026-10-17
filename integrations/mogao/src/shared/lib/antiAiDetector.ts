/**
 * 去AI化检测器
 * 基于 novel-creator-skill 的七种模式，使用纯正则规则实现，无需 AI 调用。
 * 输出可执行的改写建议，而非直接修改。
 */

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface AntiAiIssue {
  id: string;
  type: string;
  label: string;
  severity: IssueSeverity;
  count: number;
  density: string;        // 如 "3.2次/千字"
  examples: string[];     // 最多5个匹配片段
  suggestion: string;     // 具体改写指令
}

export interface AntiAiReport {
  issues: AntiAiIssue[];
  totalScore: number;      // 0-100，越高越"AI味"
  verdict: string;
  charCount: number;
}

// ─── 检测规则配置 ─────────────────────────────────────────────────────────────

// 1. 高频震惊词（AI 喜欢用来制造紧迫感的词）
const SHOCK_WORDS = [
  '突然', '忽然', '顿时', '不禁', '不由得', '赫然', '蓦然', '猛然', '骤然',
  '霎时', '刹那', '蓦地', '猛地', '陡然', '陡地',
];

// 2. 空洞强调词（弱副词）
const WEAK_ADVERBS = [
  '非常', '十分', '极其', '相当', '颇为', '无比', '格外', '万分', '异常',
  '极度', '高度', '深深', '深切', '浓浓', '满满', '深深地', '静静地',
];

// 3. 正式语体入侵（学术/公文用语）
const FORMAL_INTRUSIONS = [
  '诚然', '固然', '诚如', '毋庸置疑', '不言而喻', '显而易见', '众所周知',
  '不可否认', '毫无疑问', '不容置疑', '可以说', '从某种意义上',
];

// 4. 套话结尾（内心独白陷阱）
const CLICHE_THOUGHTS = [
  '心中暗道', '他心想', '她心想', '心里想道', '暗自思忖', '思绪万千',
  '不禁想到', '心中一动', '心中暗想', '心底涌起', '暗自盘算',
  '心头一震', '心中一凛', '心头一紧',
];

// 5. 论文式段落起首
const ESSAY_STARTERS = [
  '综上所述', '由此可见', '总的来说', '总而言之', '简而言之',
  '换句话说', '也就是说', '事实上，', '实际上，', '从这个角度来看',
  '不难发现', '可以看出', '由此得出',
];

// 6. 过度工整排比（三项及以上并列）
const TRIPLE_LIST_RE = /[一-龥a-zA-Z0-9]{2,8}[、，,]\s*[一-龥a-zA-Z0-9]{2,8}[、，,]\s*[一-龥a-zA-Z0-9]{2,8}(?:[、，,]\s*[一-龥a-zA-Z0-9]{2,8}){0,2}/g;

// 7. 意义膨胀短语（说废话）
const FILLER_PHRASES = [
  '让人不禁', '令人忍不住', '不得不说', '不由自主', '情不自禁',
  '无可奈何', '百感交集', '心情复杂', '思绪纷飞', '感慨万千',
  '一时语塞', '不知如何是好', '不知道该说什么',
];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function countPerKChars(count: number, charCount: number): string {
  if (charCount === 0) return '0次/千字';
  return `${(count / charCount * 1000).toFixed(1)}次/千字`;
}

function extractContext(text: string, index: number, radius = 15): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius + 10);
  const snippet = text.slice(start, end).replace(/\n/g, ' ');
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '');
}

function findWordOccurrences(text: string, words: string[]): { count: number; examples: string[] } {
  const examples: string[] = [];
  let count = 0;
  for (const word of words) {
    let idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) {
      count++;
      if (examples.length < 5) examples.push(extractContext(text, idx));
      idx += word.length;
    }
  }
  return { count, examples };
}

// ─── 主检测函数 ───────────────────────────────────────────────────────────────

export function detectAntiAiPatterns(rawText: string): AntiAiReport {
  const text = rawText.replace(/<[^>]*>/g, '').trim();
  const charCount = text.length;
  if (charCount < 100) {
    return { issues: [], totalScore: 0, verdict: '内容过短，无法分析', charCount };
  }

  const issues: AntiAiIssue[] = [];

  // ── 1. 震惊词滥用 ──────────────────────────────────────────────────────────
  const shock = findWordOccurrences(text, SHOCK_WORDS);
  const shockDensity = shock.count / charCount * 1000;
  if (shockDensity > 2) {
    issues.push({
      id: 'shock_words',
      type: '震惊词滥用',
      label: '突然/忽然/猛然…',
      severity: shockDensity > 5 ? 'high' : 'medium',
      count: shock.count,
      density: countPerKChars(shock.count, charCount),
      examples: shock.examples,
      suggestion: '将"突然/忽然"等词删除，改用动作本身描述变化。如"突然门开了"→"门吱呀一声开了"。',
    });
  }

  // ── 2. 弱副词密度 ──────────────────────────────────────────────────────────
  const weakAdv = findWordOccurrences(text, WEAK_ADVERBS);
  const weakDensity = weakAdv.count / charCount * 1000;
  if (weakDensity > 3) {
    issues.push({
      id: 'weak_adverbs',
      type: '弱副词堆砌',
      label: '非常/十分/极其…',
      severity: weakDensity > 6 ? 'high' : 'medium',
      count: weakAdv.count,
      density: countPerKChars(weakAdv.count, charCount),
      examples: weakAdv.examples,
      suggestion: '删除所有"非常/十分/极其"类副词，改用具体细节表现强度。如"非常愤怒"→"拳头攥紧，指甲掐进掌心"。',
    });
  }

  // ── 3. 正式语体入侵 ────────────────────────────────────────────────────────
  const formal = findWordOccurrences(text, FORMAL_INTRUSIONS);
  if (formal.count > 0) {
    issues.push({
      id: 'formal_intrusion',
      type: '正式语体入侵',
      label: '毋庸置疑/不言而喻…',
      severity: formal.count > 3 ? 'high' : 'low',
      count: formal.count,
      density: countPerKChars(formal.count, charCount),
      examples: formal.examples,
      suggestion: '删除学术/公文用语，换成口语化或人物视角的表达。这类词出现在小说正文中会极大破坏沉浸感。',
    });
  }

  // ── 4. 套话内心独白 ────────────────────────────────────────────────────────
  const cliche = findWordOccurrences(text, CLICHE_THOUGHTS);
  const clicheDensity = cliche.count / charCount * 1000;
  if (clicheDensity > 1.5) {
    issues.push({
      id: 'cliche_thoughts',
      type: '套话内心独白',
      label: '心中暗道/暗自思忖…',
      severity: clicheDensity > 4 ? 'high' : 'medium',
      count: cliche.count,
      density: countPerKChars(cliche.count, charCount),
      examples: cliche.examples,
      suggestion: '减少"心中暗道/暗自思忖"标签，改为直接写出内心想法或外化为行为。每章内心独白标签不超过2次。',
    });
  }

  // ── 5. 论文式段落起首 ──────────────────────────────────────────────────────
  const essay = findWordOccurrences(text, ESSAY_STARTERS);
  if (essay.count > 0) {
    issues.push({
      id: 'essay_structure',
      type: '论文段落结构',
      label: '综上所述/由此可见…',
      severity: essay.count > 2 ? 'high' : 'medium',
      count: essay.count,
      density: countPerKChars(essay.count, charCount),
      examples: essay.examples,
      suggestion: '删除所有"综上/由此可见/总而言之"等段落起首词，小说不是议论文，结论要通过叙事呈现。',
    });
  }

  // ── 6. 三项排比滥用 ────────────────────────────────────────────────────────
  const tripleMatches = [...text.matchAll(TRIPLE_LIST_RE)];
  const tripleCount = tripleMatches.length;
  const tripleDensity = tripleCount / charCount * 1000;
  if (tripleDensity > 3) {
    const tripleExamples = tripleMatches.slice(0, 5).map(m => m[0]);
    issues.push({
      id: 'triple_list',
      type: '三项排比滥用',
      label: 'A、B、C并列结构',
      severity: tripleDensity > 6 ? 'high' : 'medium',
      count: tripleCount,
      density: countPerKChars(tripleCount, charCount),
      examples: tripleExamples,
      suggestion: '把并列结构打散，用连续动作或递进叙述替代。如"勇敢、坚强、无畏"→具体场景中展示一个品质即可。',
    });
  }

  // ── 7. 意义膨胀填充 ────────────────────────────────────────────────────────
  const filler = findWordOccurrences(text, FILLER_PHRASES);
  const fillerDensity = filler.count / charCount * 1000;
  if (fillerDensity > 1) {
    issues.push({
      id: 'filler_phrases',
      type: '意义膨胀填充',
      label: '让人不禁/情不自禁…',
      severity: fillerDensity > 3 ? 'high' : 'low',
      count: filler.count,
      density: countPerKChars(filler.count, charCount),
      examples: filler.examples,
      suggestion: '删除"让人不禁/情不自禁"等无意义情绪包装词，直接写读者应该感受到的内容。',
    });
  }

  // ── 综合评分（AI味指数 0-100）────────────────────────────────────────────
  const highCount = issues.filter(i => i.severity === 'high').length;
  const midCount = issues.filter(i => i.severity === 'medium').length;
  const lowCount = issues.filter(i => i.severity === 'low').length;
  const totalScore = Math.min(100, highCount * 25 + midCount * 12 + lowCount * 5);

  let verdict: string;
  if (totalScore === 0) verdict = '未检测到明显AI特征，整体自然';
  else if (totalScore <= 20) verdict = '有少量AI痕迹，稍作调整即可';
  else if (totalScore <= 50) verdict = 'AI特征较明显，建议重点修改标记部分';
  else verdict = 'AI味较重，建议对整章进行去模板化改写';

  return { issues, totalScore, verdict, charCount };
}

/** 章末悬念检测：扫描末尾 300 字是否有"结案信号" */
export interface EndingCheck {
  hasResolutionSignal: boolean;
  hasSuspenseHook: boolean;
  signals: string[];
  verdict: string;
}

const RESOLUTION_SIGNALS = [
  '终于解决', '终于完成', '终于结束', '大功告成', '尘埃落定',
  '圆满完成', '一切恢复正常', '问题迎刃而解', '顺利完成', '完美落幕',
  '皆大欢喜', '万事大吉', '平安无事', '安然无恙',
];

const SUSPENSE_SIGNALS = [
  '？', '突然', '没想到', '意想不到', '此时', '就在这时',
  '然而', '却', '可是', '没有', '不知', '未曾', '似乎', '仿佛',
];

export function checkChapterEnding(rawText: string): EndingCheck {
  const text = rawText.replace(/<[^>]*>/g, '').trim();
  const tail = text.slice(-300);

  const signals = RESOLUTION_SIGNALS.filter(s => tail.includes(s));
  const hasResolutionSignal = signals.length > 0;
  const hasSuspenseHook = SUSPENSE_SIGNALS.some(s => tail.includes(s));

  let verdict: string;
  if (hasResolutionSignal) {
    verdict = `检测到结案信号（${signals.join('、')}），可用作阶段收束；是否另留悬念由本章意图和作者目标决定。`;
  } else if (hasSuspenseHook) {
    verdict = '检测到可能的悬念词，请结合上下文判断是否形成有效悬念。';
  } else {
    verdict = '未命中悬念关键词。完整收束、余韵或留白都可成立，无需为检测而改写。';
  }

  return { hasResolutionSignal, hasSuspenseHook, signals, verdict };
}
