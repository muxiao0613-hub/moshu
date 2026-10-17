/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
// Export only: retain paragraph boundaries and decode editor entities.
export function exportPlainText(html: string): string {
 const doc = new DOMParser().parseFromString(html, 'text/html');
 doc.querySelectorAll('script,style').forEach(node => node.remove());
 doc.querySelectorAll('br').forEach(node => node.replaceWith(doc.createTextNode('\n')));
 doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote').forEach(node => node.append(doc.createTextNode('\n\n')));
 return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
