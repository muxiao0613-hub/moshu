import { apiClient } from './client';

export interface DailyUsage {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  costCNY: number;
}

const KEY = 'mogao_token_usage';
const EVENT = 'mogao-token-update';

// 单位：元 / 百万 tokens（人民币）
// 缓存未命中价格（worst case）；OpenAI 按 1 USD ≈ 7.2 CNY 换算
// DeepSeek V4 折扣价为官网 2.5折促销价
export const MODEL_PRICING: Record<string, { input: number; output: number; inputCacheHit?: number }> = {
  // DeepSeek V4（新）
  'deepseek-v4-flash':    { input: 1,   output: 2,  inputCacheHit: 0.02  },
  'deepseek-v4-pro':      { input: 3,   output: 6,  inputCacheHit: 0.025 },  // 2.5折促销价
  // DeepSeek 旧版（保留兼容）
  'deepseek-chat':        { input: 1,   output: 2   },
  'deepseek-reasoner':    { input: 4,   output: 16  },
  // 通义千问
  'qwen-turbo':         { input: 0.3,  output: 0.6  },
  'qwen-plus':          { input: 0.8,  output: 2    },
  'qwen-max':           { input: 40,   output: 120  },
  'qwen-long':          { input: 0.5,  output: 2    },
  // 智谱 GLM
  'glm-4-flash':        { input: 0.1,  output: 0.1  },
  'glm-4-air':          { input: 1,    output: 1    },
  'glm-4-long':         { input: 1,    output: 1    },
  'glm-4':              { input: 100,  output: 100  },
  'glm-4-plus':         { input: 50,   output: 50   },
  // OpenAI（USD × 7.2）
  'gpt-4o-mini':        { input: 1.08,  output: 4.32  },
  'gpt-4o':             { input: 36,    output: 108   },
};

/** 根据模型名查找定价，支持前缀模糊匹配（如 deepseek-chat-xxx → deepseek-chat） */
function findPricing(model: string): { input: number; output: number } | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  // 精确匹配
  if (MODEL_PRICING[lower]) return MODEL_PRICING[lower];
  // 前缀匹配（取最长前缀）
  const key = Object.keys(MODEL_PRICING)
    .filter(k => lower.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? MODEL_PRICING[key] : null;
}

/** 计算费用（CNY），无对应定价返回 0 */
export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = findPricing(model);
  if (!pricing) return 0;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

export function readUsage(): DailyUsage[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * 即发即弃地把用量上报给服务器（按用户·当日·模型累加）。
 * 仅在已登录时上报；失败静默，绝不阻断 AI 流程或抛错。
 */
function reportUsageToServer(promptTokens: number, completionTokens: number, model?: string): void {
  if (!localStorage.getItem('mogao_access_token')) return;
  // 托管模式由后端代理结算时已写 api_usage，避免前端重复上报造成双计
  if (localStorage.getItem('mogao_ai_mode') === 'managed') return;
  const costCny = model ? calculateCost(model, promptTokens, completionTokens) : 0;
  apiClient.post('/usage/report', {
    promptTokens: Math.max(0, Math.round(promptTokens || 0)),
    completionTokens: Math.max(0, Math.round(completionTokens || 0)),
    costCny,
    model: model || undefined,
  }).catch(() => { /* 上报失败不影响本地记账 */ });
}

export function recordUsage(promptTokens: number, completionTokens: number, model?: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const all = readUsage();
  let day = all.find(d => d.date === today);
  if (!day) {
    day = { date: today, promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0, costCNY: 0 };
    all.push(day);
  }
  day.promptTokens += promptTokens;
  day.completionTokens += completionTokens;
  day.totalTokens += promptTokens + completionTokens;
  day.calls += 1;
  if (model) day.costCNY = (day.costCNY || 0) + calculateCost(model, promptTokens, completionTokens);
  // 只保留最近 30 天
  all.sort((a, b) => b.date.localeCompare(a.date));
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 30)));
  window.dispatchEvent(new CustomEvent(EVENT));
  // 同步上报服务器（用于管理端用量看板）
  reportUsageToServer(promptTokens, completionTokens, model);
}

/** 文本粗略估算 token 数（中文约1字=1token，英文约4字=1token） */
export function estimateTokens(text: string): number {
  const chinese = (text.match(/[一-龥]/g) || []).length;
  const rest = text.length - chinese;
  return chinese + Math.ceil(rest / 4);
}

export function getTodayUsage(): DailyUsage | null {
  const today = new Date().toISOString().slice(0, 10);
  return readUsage().find(d => d.date === today) || null;
}

export function getTotalTokens(): number {
  return readUsage().reduce((s, d) => s + d.totalTokens, 0);
}

export function getTotalCost(): number {
  return readUsage().reduce((s, d) => s + (d.costCNY || 0), 0);
}

export function clearUsage(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 格式化费用，< 0.01 显示 <¥0.01，否则保留2位小数 */
export function formatCost(cny: number): string {
  if (cny <= 0) return '';
  if (cny < 0.01) return '<¥0.01';
  if (cny >= 1) return `¥${cny.toFixed(2)}`;
  return `¥${cny.toFixed(3)}`;
}

export const TOKEN_UPDATE_EVENT = EVENT;
