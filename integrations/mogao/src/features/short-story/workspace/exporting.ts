/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * 短篇写作台 · 导出：把当前正文按标题打包成 docx 并触发下载。
 *
 * 在拆分中的位置：workspace 的叶子工具模块，被视图层的「导出 docx」按钮调用；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：只依赖 file-saver、动态加载的 docx 与 @/features/ai 的正文提取，不依赖 workspace 内其它模块。
 */
import { saveAs } from 'file-saver';
import { exportPlainText } from '@/host/plainText';
import type { ShortStory } from '@/shared/types';

/**
 * 导出 docx。
 *
 * @param titleInput 标题输入框当前值（可能为空，回落到 story.title）
 * @param html       编辑器正文 HTML（可能为空，回落到 story.content）
 * @param story      当前故事，提供标题与正文兜底
 */
export async function exportStoryDocx(
  titleInput: string,
  html: string | undefined,
  story: ShortStory,
): Promise<void> {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx');
  const title = titleInput || story.title || '无标题故事';
  const plain = exportPlainText(html || story.content || '');
  const paragraphs = plain.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'SimSun', size: 24 },
          paragraph: { spacing: { line: 420, after: 120 } },
        },
      },
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
        ...paragraphs.map(p => new Paragraph({
          children: [new TextRun({ text: p })],
          indent: { firstLine: 480 },
        })),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  await saveAs(blob, `${title}.docx`);
}
