const KEY_PATTERN = /^[\p{L}\p{M}\p{N}_-]{1,64}$/u;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 12;
const UNBIASED_BYTE_LIMIT = 252;

export function generateKey(): string {
  let key = '';
  while (key.length < KEY_LENGTH) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Uses Web Crypto in Obsidian's renderer on desktop and mobile.
    const bytes = window.crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
    for (const byte of bytes) {
      // Rejection sampling avoids favouring the first alphabet characters.
      if (byte < UNBIASED_BYTE_LIMIT && key.length < KEY_LENGTH) {
        key += ALPHABET.charAt(byte % ALPHABET.length);
      }
    }
  }
  return key;
}

export function keyIdentity(key: string): string {
  return normalizeKey(key).toLowerCase().normalize('NFC');
}

export function normalizeKey(key: string): string {
  const normalized = key.normalize('NFC');
  if (!KEY_PATTERN.test(normalized)) {
    throw new Error('A key must contain 1–64 letters, marks, numbers, hyphens or underscores.');
  }
  return normalized;
}
