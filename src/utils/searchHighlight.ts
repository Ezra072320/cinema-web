import DOMPurify from 'dompurify';

/** ES fragments are untrusted HTML. Only inert mark tags are allowed, with no attributes. */
export function searchHighlight(fragment?: string): string {
  return DOMPurify.sanitize(fragment ?? '', { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: [] });
}
