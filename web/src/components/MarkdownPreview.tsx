import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Published books contain user-authored Markdown; sanitize before rendering HTML.
export default function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content, { breaks: true, gfm: true, async: false }), {
    ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'start', 'align', 'type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: false,
  }), [content]);
  return <div className="md-preview reading-preview font-creative text-base leading-8 text-ink/80" dangerouslySetInnerHTML={{ __html: html }} />;
}
