import terminalLink from "terminal-link";

// Discord CDN attachment URLs (and similar) wrap across many terminal lines and
// are hard to read or click. We rewrite only *long* URLs into OSC 8 hyperlinks
// with a compact label; short URLs are left as plain text (already readable and
// auto-clickable in most terminals). On terminals without hyperlink support
// (e.g. macOS Terminal.app) terminal-link's fallback restores the raw URL, so
// nothing is ever hidden where it can't be clicked.

const URL_RE = /https?:\/\/[^\s<>]+/g;
const LONG_URL_THRESHOLD = 60;
const MAX_LABEL_LEN = 48;

function truncate(s: string): string {
  return s.length > MAX_LABEL_LEN ? `${s.slice(0, MAX_LABEL_LEN - 1)}…` : s;
}

export function shortenUrlLabel(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return truncate(url);
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const last = segments.length
    ? decodeURIComponent(segments[segments.length - 1] ?? "")
    : "";
  const label = last ? `${parsed.hostname}/…/${last}` : parsed.hostname;
  return truncate(label);
}

export function linkify(body: string): string {
  return body.replace(URL_RE, (url) => {
    if (url.length <= LONG_URL_THRESHOLD) return url;
    return terminalLink(shortenUrlLabel(url), url, {
      fallback: (_text, fullUrl) => fullUrl,
    });
  });
}
