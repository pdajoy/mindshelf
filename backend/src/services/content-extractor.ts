import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';

export type ExtractorType = 'innerText' | 'readability' | 'defuddle';

export interface ExtractedContent {
  title: string;
  markdown: string;
  html: string;
  plainText: string;
  excerpt: string;
  wordCount: number;
  extractor: ExtractorType;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
});

export function extractContent(
  html: string,
  url: string,
  extractor: ExtractorType = 'readability',
): ExtractedContent {
  if (extractor === 'innerText') {
    return extractInnerText(html, url);
  }
  if (extractor === 'readability') {
    return extractWithReadability(html, url);
  }
  return extractWithReadability(html, url);
}

function extractInnerText(html: string, url: string): ExtractedContent {
  const { document } = parseHTML(html);
  const title = document.title || '';
  const body = document.body;

  for (const tag of ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript']) {
    for (const el of body.querySelectorAll(tag)) el.remove();
  }

  const plainText = (body.textContent || '').replace(/\s+/g, ' ').trim();
  const words = plainText.split(/\s+/).filter(Boolean);

  return {
    title,
    markdown: plainText,
    html: '',
    plainText,
    excerpt: plainText.substring(0, 300),
    wordCount: words.length,
    extractor: 'innerText',
  };
}

const MIN_QUALITY_CHARS = 500;

function extractWithReadability(html: string, url: string): ExtractedContent {
  const { document } = parseHTML(html);

  const reader = new Readability(document as any, {
    charThreshold: 100,
  });

  const article = reader.parse();

  if (!article) {
    return extractInnerText(html, url);
  }

  const contentHtml = article.content || '';
  const plainText = (article.textContent || '').replace(/\s+/g, ' ').trim();

  if (plainText.length < MIN_QUALITY_CHARS) {
    const fallback = extractInnerText(html, url);
    if (fallback.plainText.length > plainText.length * 2) {
      console.log(`[Extractor] Readability got ${plainText.length} chars, innerText got ${fallback.plainText.length} chars — using innerText`);
      return { ...fallback, title: article.title || fallback.title, extractor: 'readability' };
    }
  }

  const markdown = turndown.turndown(contentHtml);
  const words = plainText.split(/\s+/).filter(Boolean);

  return {
    title: article.title || '',
    markdown,
    html: contentHtml,
    plainText,
    excerpt: article.excerpt || plainText.substring(0, 300),
    wordCount: words.length,
    extractor: 'readability',
  };
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(?!<)/, '<p>')
    .replace(/(?!>)$/, '</p>');
}
