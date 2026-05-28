import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const DISCRIMINATOR_SPACE = ALPHABET.length ** 4;

export function generateDiscriminator(): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function isValidDiscriminator(s: string): boolean {
  return /^[a-z0-9]{4}$/.test(s);
}

// Derive a stable 4-char [a-z0-9] discriminator from an external source ID
// (e.g. Discord snowflake) without exposing raw ID suffixes.
export function discriminatorFromSourceId(sourceId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sourceId.length; i++) {
    hash ^= sourceId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const bucket = hash % DISCRIMINATOR_SPACE;
  return bucket.toString(36).padStart(4, "0");
}
