/** 检查依据的规范化序列化；与 client/shared/lib/revisionBasis.ts 保持相同口径并做一致性测试。 */
const PROJECT = ['id', 'title', 'genre', 'synopsis', 'targetPlatform', 'qualityGoal', 'styleFingerprint', 'styleSamples', 'storyBible', 'factLedger'];
const CHARACTER = ['id', 'name', 'aliases', 'role', 'age', 'gender', 'appearance', 'personality', 'goals', 'background', 'abilities', 'arc', 'notes', 'relationships', 'voiceSamples', 'lifeMemories', 'profileVersions'];
const WORLD = ['id', 'category', 'title', 'content', 'tags'];
const ARRAY_FIELDS = new Set(['aliases', 'relationships', 'voiceSamples', 'lifeMemories', 'profileVersions', 'styleSamples', 'factLedger', 'tags', 'relatedChapters', 'relatedCharacters']);
const OBJECT_FIELDS = new Set(['storyBible', 'styleFingerprint']);
const THREAD = ['id', 'title', 'description', 'status', 'importance', 'notes', 'relatedChapters', 'relatedCharacters'];
export function revisionBasis(params: { project: object; characters?: object[]; worldSettings?: object[]; threads?: object[] }): string {
  // 空值与旧库进入页面后的默认值相同，避免仅补齐数组就令检查依据失效。
  const pick = (value: object, keys: string[]) => Object.fromEntries(keys.map(k => [k,
    (value as Record<string, unknown>)[k] ?? (ARRAY_FIELDS.has(k) ? [] : OBJECT_FIELDS.has(k) ? null : k === 'role' ? 'minor' : '')]));
  const rows = (values: object[] | undefined, keys: string[]) => (values ?? []).map(v => pick(v, keys)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const canonical = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
  };
  return JSON.stringify(canonical({ project: pick(params.project, PROJECT), characters: rows(params.characters, CHARACTER), worldSettings: rows(params.worldSettings, WORLD), threads: rows(params.threads, THREAD) }));
}
