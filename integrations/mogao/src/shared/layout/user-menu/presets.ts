/**
 * 自带 Key 模式的服务商预设：一键填好 Base URL、默认模型与 Key 申请地址。
 *
 * 在拆分中的位置：纯常量，对外门面是 `shared/layout/UserMenu.tsx`，
 * 只被 AI 配置 tab 使用。
 * 依赖方向：（本文件）→ user-menu/AiSettingsTab。
 */

/** 预设服务商；`keyUrl` 指向各家申请 Key 的官方页面。 */
export const PRESETS = [
  { label: 'DeepSeek',  baseURL: 'https://api.deepseek.com',                           model: 'deepseek-v4-flash', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { label: '通义千问',   baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus',         keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { label: '智谱 GLM',  baseURL: 'https://open.bigmodel.cn/api/paas/v4',               model: 'glm-4-flash',       keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { label: 'OpenAI',    baseURL: 'https://api.openai.com/v1',                          model: 'gpt-4o-mini',       keyUrl: 'https://platform.openai.com/api-keys' },
  { label: 'Anthropic', baseURL: 'https://api.anthropic.com/v1',                       model: 'claude-sonnet-4-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
];
