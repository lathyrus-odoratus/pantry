/**
 * Canonicalize a 6-digit hex color string to `#RRGGBB` uppercase form.
 * Input has already been validated by HexColorSchema; this only normalizes
 * the representation (case, optional leading `#`).
 */
export function normalizeColor(input: string): string {
  const stripped = input.startsWith("#") ? input.slice(1) : input;
  return `#${stripped.toUpperCase()}`;
}
