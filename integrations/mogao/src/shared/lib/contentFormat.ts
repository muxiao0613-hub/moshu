/**
 * Utilities for keeping AI-generated novel text readable inside TipTap.
 * The database stores chapter content as HTML, so plain AI text must be
 * normalized before saving; otherwise newlines can collapse into one paragraph.
 */

const HTML_TAG_RE = /<\/?(?:p|br|div|h[1-6]|blockquote|ul|ol|li|strong|em|span|section|article)\b/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function trimCodeFence(text: string): string {
  let s = text.trim();
  s = s.replace(/^```(?:html|markdown|md|txt)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return s;
}

function splitLongChineseParagraph(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.length <= 260) return [trimmed];

  const sentences = trimmed.match(/[^。！？!?；;…]+[。！？!?；;…」"』）)]*/g);
  if (!sentences || sentences.length <= 1) return [trimmed];

  const result: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const next = current + sentence;
    if (next.length >= 160 && current.length > 0) {
      result.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result.length > 0 ? result : [trimmed];
}

function isChapterHeading(line: string): boolean {
  return /^第[一二三四五六七八九十百千万零〇两\d]+[章节卷回幕]/.test(line.trim());
}

export function isLikelyHtml(content: string): boolean {
  return HTML_TAG_RE.test(content || '');
}

/** 去除 HTML 标签，得到纯文本（轻量，无第三方依赖）。 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Convert plain AI output into paragraph-based HTML for the editor. */
export function plainTextToChapterHtml(text: string): string {
  const cleaned = trimCodeFence(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  if (!cleaned) return '';

  const lines = cleaned
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(splitLongChineseParagraph);

  return lines.map(line => {
    const safe = escapeHtml(line);
    if (isChapterHeading(line)) return `<h2>${safe}</h2>`;
    return `<p>${safe}</p>`;
  }).join('\n');
}

/** Ensure chapter content is valid readable HTML; existing HTML is kept. */
export function ensureChapterHtml(content: string): string {
  const text = content || '';
  if (!text.trim()) return '';
  if (isLikelyHtml(text)) return text;
  return plainTextToChapterHtml(text);
}

