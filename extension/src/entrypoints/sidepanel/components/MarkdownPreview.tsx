import { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-removed=')
    .replace(/javascript:/gi, '');
}

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (!content) return '';
    try {
      const raw = marked.parse(content) as string;
      return sanitizeHtml(raw);
    } catch {
      return `<p>${content.replace(/</g, '&lt;')}</p>`;
    }
  }, [content]);

  return (
    <div
      className={`md-preview ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
