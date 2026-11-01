import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  generateKey,
  keyIdentity,
  normalizeKey
} from './key.ts';

describe('keys', () => {
  it('accepts Unicode letters, marks and numbers and normalizes NFC', () => {
    expect(normalizeKey('e\u{301}_文字-١')).toBe('é_文字-١');
    expect(keyIdentity('É')).toBe(keyIdentity('e\u{301}'));
    expect(normalizeKey('𐐀'.repeat(64))).toHaveLength(128);
  });

  it.each(['', 'a'.repeat(65), 'a b', 'a/b', '#a', '^a', '|', '[a]', '💡', 'a\nb'])('rejects invalid key %j', (key) => {
    expect(() => normalizeKey(key)).toThrow('A key must contain');
  });

  it('generates twelve lowercase ASCII letters or digits', () => {
    expect(generateKey()).toMatch(/^[a-z0-9]{12}$/u);
  });

  it('generates a lowercase GUID without hyphens that is a valid typed key', () => {
    const key = generateKey('guid');
    expect(key).toMatch(/^[0-9a-f]{32}$/u);
    expect(normalizeKey(key)).toBe(key);
  });

  it('rejects biased random bytes and fills the key from a later batch', () => {
    const random = vi.spyOn(window.crypto, 'getRandomValues');
    random.mockReturnValueOnce(new Uint8Array(12).fill(255));
    random.mockReturnValueOnce(new Uint8Array(12).fill(0));
    expect(generateKey()).toBe('aaaaaaaaaaaa');
    random.mockRestore();
  });
});
