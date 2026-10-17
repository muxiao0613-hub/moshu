import type { StoryPlatform } from '@/shared/types';
import { PLATFORM_CONFIGS } from '@/shared/lib/storyRules';

/**
 * 「按哪个平台的规则写作/体检」的偏好（本机、按作品隔离）。
 *
 * 为什么需要它：写作台的格式体检条允许切换平台，而生成链路也需要知道这个选择
 * —— 否则「选平台」只影响提示条颜色，不影响模型收到的约束，就成了摆设。
 * 体检条与生成链路读同一份偏好，两者不会漂移。
 */

const KEY = (projectId: string) => `mogao_format_platform:${projectId}`;

const PLATFORM_KEYS = Object.keys(PLATFORM_CONFIGS) as StoryPlatform[];

export function isStoryPlatform(value: string | undefined | null): value is StoryPlatform {
  return !!value && (PLATFORM_KEYS as string[]).includes(value);
}

export function loadFormatPlatform(projectId: string): StoryPlatform | '' {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (isStoryPlatform(raw)) return raw;
  } catch { /* 忽略不可用存储 */ }
  return '';
}

export function saveFormatPlatform(projectId: string, value: StoryPlatform | ''): void {
  try {
    if (value) localStorage.setItem(KEY(projectId), value);
    else localStorage.removeItem(KEY(projectId));
  } catch { /* 忽略 */ }
}

/** 作品声明的目标平台是否落在已知平台里（用于给体检条选默认值） */
export function fallbackPlatform(projectPlatform?: string | null): StoryPlatform {
  return isStoryPlatform(projectPlatform) ? projectPlatform : '自由创作';
}

/**
 * 生成链路用的平台覆盖值：
 * 用户在体检条里显式选了具体平台就用它；选「自由创作」或未选时不覆盖，
 * 继续沿用作品自己的 targetPlatform（避免把 番茄/起点 这类长篇平台的写法抹掉）。
 */
export function platformOverride(projectId: string): string | undefined {
  const chosen = loadFormatPlatform(projectId);
  return chosen && chosen !== '自由创作' ? chosen : undefined;
}
