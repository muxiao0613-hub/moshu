/**
 * 小说文件章节分割器
 * 支持：.txt 文件
 * 自动识别中文小说常见章节标题格式
 */

export interface DetectedChapter {
  order: number;
  title: string;
  content: string;
  wordCount: number;
}

// 章节标题识别正则（按优先级排列）
const CHAPTER_PATTERNS = [
  // 第X章/卷/节/回/幕
  /^第[零一二三四五六七八九十百千万\d〇两]+[章节卷回幕集部][^\n]{0,30}$/,
  // Chapter X
  /^Chapter\s+\d+[^\n]{0,30}$/i,
  // 纯数字章节
  /^\d{1,4}[、.．。]\s*[^\n]{2,30}$/,
  // 【XXX】标题格式
  /^【[^】]{2,20}】$/,
  // ===标题===
  /^={2,}\s*[^\n]{2,30}\s*={2,}$/,
];

function isChapterTitle(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  return CHAPTER_PATTERNS.some(p => p.test(trimmed));
}

function countChineseWords(text: string): number {
  const chinese = (text.match(/[一-龥]/g) || []).length;
  const english = (text.replace(/[一-龥]/g, ' ').match(/\b\w+\b/g) || []).length;
  return chinese + english;
}

export interface SplitResult {
  chapters: DetectedChapter[];
  totalWords: number;
  detectionMethod: string;
}

export function splitNovelText(rawText: string): SplitResult {
  // 统一换行符
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const lines = text.split('\n');

  // 尝试按章节标题分割
  const chapterBreaks: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isChapterTitle(lines[i])) {
      chapterBreaks.push(i);
    }
  }

  // 如果识别到至少2个章节标题，使用标题分割
  if (chapterBreaks.length >= 2) {
    const chapters: DetectedChapter[] = [];
    for (let i = 0; i < chapterBreaks.length; i++) {
      const startLine = chapterBreaks[i];
      const endLine = i + 1 < chapterBreaks.length ? chapterBreaks[i + 1] : lines.length;
      const title = lines[startLine].trim();
      const content = lines.slice(startLine + 1, endLine).join('\n').trim();
      const wordCount = countChineseWords(content);
      chapters.push({ order: i + 1, title, content, wordCount });
    }

    // 过滤掉字数极少的伪章节（< 50字）
    const valid = chapters.filter(c => c.wordCount >= 50);
    if (valid.length >= 2) {
      return {
        chapters: valid.map((c, i) => ({ ...c, order: i + 1 })),
        totalWords: valid.reduce((s, c) => s + c.wordCount, 0),
        detectionMethod: '标题识别',
      };
    }
  }

  // 回退：按固定字数分块（每3000字一章）
  const CHUNK_SIZE = 3000;
  const cleanText = text;
  const chunks: DetectedChapter[] = [];
  let offset = 0;
  let order = 1;

  while (offset < cleanText.length) {
    // 找到最近的句子结束位置
    let end = Math.min(offset + CHUNK_SIZE, cleanText.length);
    if (end < cleanText.length) {
      // 向后找句末标点
      const tail = cleanText.slice(end, Math.min(end + 200, cleanText.length));
      const match = tail.match(/[。！？\n]/);
      if (match && match.index !== undefined) end += match.index + 1;
    }
    const chunk = cleanText.slice(offset, end).trim();
    if (chunk) {
      chunks.push({
        order,
        title: `第${order}章`,
        content: chunk,
        wordCount: countChineseWords(chunk),
      });
      order++;
    }
    offset = end;
  }

  return {
    chapters: chunks,
    totalWords: chunks.reduce((s, c) => s + c.wordCount, 0),
    detectionMethod: '字数分块（未识别到章节标题）',
  };
}
