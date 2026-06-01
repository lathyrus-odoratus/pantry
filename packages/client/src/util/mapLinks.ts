import { decodePermalink, type MapV1 } from "@pantry/shared";

const URL_RE = /https?:\/\/[^\s<>]+/g;

/**
 * Find map permalinks embedded in a chat message body and decode them.
 * Only URLs carrying a `#m=` payload are considered; anything that fails to
 * decode is silently skipped (it's just a normal link).
 */
export function findMaps(body: string): MapV1[] {
  const maps: MapV1[] = [];
  const urls = body.match(URL_RE);
  if (!urls) return maps;
  for (const url of urls) {
    if (!url.includes("#m=")) continue;
    try {
      maps.push(decodePermalink(url));
    } catch {
      // not a valid map permalink — leave it as a plain link
    }
  }
  return maps;
}
