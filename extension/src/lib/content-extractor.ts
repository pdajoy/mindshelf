import Defuddle from 'defuddle';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export type ExtractorType = 'defuddle' | 'readability' | 'innerText';

export interface PageContent {
  title: string;
  url: string;
  domain: string;
  markdown: string;
  plainText: string;
  excerpt: string;
  wordCount: number;
  images: string[];
  extractedBy: ExtractorType;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndown.use(gfm);

turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (c) => `~~${c}~~`,
});

function resolveMarkdownImages(md: string, baseUrl: string): string {
  return md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const resolved = resolveImgSrc(src, baseUrl);
    if (resolved && resolved !== src) return `![${alt}](${resolved})`;
    return _match;
  });
}

const MIN_QUALITY = 500;

function pickBestSrcsetUrl(srcset: string): string | null {
  const candidates = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
  return candidates[candidates.length - 1] || candidates[0] || null;
}

function resolveImgSrc(raw: string, pageUrl: string): string {
  if (!raw || raw.startsWith('data:')) return raw;
  if (raw.startsWith('chrome-extension://') || raw.startsWith('chrome://')) {
    try {
      const parsed = new URL(raw);
      const relative = parsed.pathname;
      return new URL(relative, pageUrl).href;
    } catch { return ''; }
  }
  if (raw.startsWith('http')) return raw;
  try { return new URL(raw, pageUrl).href; } catch { return ''; }
}

export function extractFromHTML(
  html: string,
  url: string,
  method: ExtractorType = 'defuddle',
): PageContent {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);

  for (const img of doc.querySelectorAll('img')) {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    const srcset = img.getAttribute('srcset') || '';
    if ((!src || src.startsWith('chrome-extension://')) && srcset) {
      src = pickBestSrcsetUrl(srcset) || src;
    }
    const resolved = resolveImgSrc(src, url);
    if (resolved && resolved !== src) img.setAttribute('src', resolved);
    if (srcset) img.removeAttribute('srcset');
  }

  for (const source of doc.querySelectorAll('picture source')) {
    source.remove();
  }

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('chrome-extension://') || href.startsWith('chrome://')) {
      try {
        const parsed = new URL(href);
        const path = parsed.pathname + parsed.search + parsed.hash;
        a.setAttribute('href', new URL(path, url).href);
      } catch {}
    }
  }

  const domain = parseDomain(url);

  if (method === 'defuddle') {
    try {
      const r = new Defuddle(doc).parse();
      if (r?.content) {
        const md = r.markdown || turndown.turndown(r.content);
        const pt = stripText(doc);
        if (md.length >= MIN_QUALITY || pt.length < MIN_QUALITY * 2) {
          return build(r.title || doc.title, url, domain, md, pt, r.excerpt, doc, 'defuddle');
        }
      }
    } catch {}
    return extractFromHTML(html, url, 'readability');
  }

  if (method === 'readability') {
    try {
      const clone = doc.cloneNode(true) as Document;
      const article = new Readability(clone).parse();
      if (article) {
        const md = turndown.turndown(article.content || '');
        const pt = (article.textContent || '').replace(/\s+/g, ' ').trim();
        if (pt.length >= MIN_QUALITY) {
          return build(article.title || doc.title, url, domain, md, pt, article.excerpt || '', doc, 'readability');
        }
        const fb = innerTextExtract(doc, url, domain);
        if (fb.plainText.length > pt.length * 1.5) {
          return { ...fb, title: article.title || fb.title, extractedBy: 'readability' };
        }
        return build(article.title || doc.title, url, domain, md, pt, article.excerpt || '', doc, 'readability');
      }
    } catch {}
    return innerTextExtract(doc, url, domain);
  }

  return innerTextExtract(doc, url, domain);
}

function innerTextExtract(doc: Document, url: string, domain: string): PageContent {
  const pt = stripText(doc);
  return build(doc.title || '', url, domain, pt, pt, '', doc, 'innerText');
}

function stripText(doc: Document): string {
  const body = doc.body;
  if (!body) return '';
  const c = body.cloneNode(true) as HTMLElement;
  for (const tag of ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript']) {
    for (const el of c.querySelectorAll(tag)) el.remove();
  }
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}

function build(
  title: string, url: string, domain: string,
  markdown: string, plainText: string, excerpt: string,
  doc: Document, extractedBy: ExtractorType,
): PageContent {
  return {
    title, url, domain,
    markdown: resolveMarkdownImages(markdown, url),
    plainText,
    excerpt: (excerpt || plainText).substring(0, 300),
    wordCount: plainText.split(/\s+/).filter(Boolean).length,
    images: extractImages(doc, url),
    extractedBy,
  };
}

function extractImages(doc: Document, baseUrl?: string): string[] {
  return Array.from(doc.querySelectorAll('img'))
    .map(img => {
      const raw = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (!raw || raw.startsWith('data:')) return '';
      if (baseUrl) return resolveImgSrc(raw, baseUrl);
      if (raw.startsWith('http')) return raw;
      return '';
    })
    .filter(Boolean)
    .slice(0, 30);
}

function parseDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}
