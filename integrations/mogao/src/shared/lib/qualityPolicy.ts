/** 创作方向 → 编辑建议。硬约束只有作者确认的设定与交付要求，审美偏好不能判成事实错误。 */
export interface QualityDirection { platform?: string | null; genre?: string; qualityGoal?: string; }
export function qualityPolicy(direction: QualityDirection): string {
  const platform = direction.platform || '自由创作';
  const literary = platform.includes('纯文学') || /散文|诗歌|文学/.test(direction.genre ?? '');
  const serial = /番茄|起点|知乎|小红书|公众号/.test(platform);
  const preference = literary
    ? '重视语言、意象、人物内在位移和留白。允许慢开篇、轻情节、开放或完整收束的结尾；不要强加爽点密度、每章反转或掐断式悬念。'
    : serial
      ? '结合目标平台关注开篇吸引力、推进和阅读动力；节奏可以起伏，喘息章与收束章有其作用。钩子、反转、短句是建议，不能按固定字数频率一刀切。'
      : '按作品自己的题材、叙述方式和作者意图评审，允许慢热、抒情、实验结构与完整收束。不要默认商业连载标准。';
  return `【创作方向】平台：${platform}；题材：${direction.genre || '自由'}。
${direction.qualityGoal ? `作者目标（优先于平台偏好）：${direction.qualityGoal}\n` : ''}${preference}
【评审分层】
硬问题：与已确认设定矛盾、时间/人物/物件事实冲突、缺失作者指定内容、正文意外重复或不完整。必须引用证据。
审美建议：钩子、节奏、修辞、感官密度与结尾形式；说明适用场景，作者可以保留不同写法。没有悬念、存在副词或格言不等于低质量。
AI味扫描只是规则命中提示，不能证明文本由AI生成。模型评分是编辑意见，不是客观测量。`;
}
