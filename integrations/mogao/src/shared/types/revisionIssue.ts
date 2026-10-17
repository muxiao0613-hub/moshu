/** 专项检查共用的问题来源、作者决策及复检记录；状态不能冒充修改事实。 */
export type IssueSource = 'consistency' | 'ai-flavor' | 'pacing' | 'review';
export interface RevisionIssue {
  id: string; key: string; source: IssueSource; chapterId: string; sourceHash: string; basisHash?: string;
  type: string; problem: string; suggestion: string; location: string; quote?: string;
  referenceChapterId?: string; referenceQuote?: string; referenceHash?: string;
  bookHash?: string;
  severity: 'high' | 'medium' | 'low'; state: 'open' | 'handled' | 'dismissed' | 'resolved' | 'stale';
  checkedAt: string; decisionAt?: string; coverage: string;
}
