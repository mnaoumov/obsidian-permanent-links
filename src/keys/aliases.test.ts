import {
  describe,
  expect,
  it
} from 'vitest';

import {
  areKeysMirrored,
  mirrorAliases,
  mirrorKeysIntoFrontmatter
} from './aliases.ts';

describe('mirrorAliases', () => {
  it('appends missing keys after the aliases the user wrote', () => {
    expect(mirrorAliases({ aliases: ['Charlie'], keys: ['abc', 'def'], previousKeys: [] })).toEqual(['Charlie', 'abc', 'def']);
  });

  it('creates the list when the note has no aliases', () => {
    expect(mirrorAliases({ aliases: undefined, keys: ['abc'], previousKeys: [] })).toEqual(['abc']);
    expect(mirrorAliases({ aliases: null, keys: ['abc'], previousKeys: [] })).toEqual(['abc']);
  });

  it('accepts a single string alias', () => {
    expect(mirrorAliases({ aliases: 'Charlie', keys: ['abc'], previousKeys: [] })).toEqual(['Charlie', 'abc']);
  });

  it('does not duplicate a key already present in any case or normalization', () => {
    expect(mirrorAliases({ aliases: ['ABC', 'e\u{301}'], keys: ['abc', 'é', 'é'], previousKeys: [] })).toEqual(['ABC', 'e\u{301}']);
  });

  it('removes aliases of keys that are no longer keys and keeps the rest', () => {
    expect(mirrorAliases({ aliases: ['Charlie', 'old', 'kept'], keys: ['kept'], previousKeys: ['OLD', 'kept'] })).toEqual(['Charlie', 'kept']);
  });

  it('removes every mirrored alias when the note loses its keys', () => {
    expect(mirrorAliases({ aliases: ['Charlie', 'abc'], keys: [], previousKeys: ['abc'] })).toEqual(['Charlie']);
  });

  it('leaves an aliases value it cannot edit untouched', () => {
    expect(mirrorAliases({ aliases: { a: 1 }, keys: ['abc'], previousKeys: [] })).toBeUndefined();
    expect(mirrorAliases({ aliases: ['a', 1], keys: ['abc'], previousKeys: [] })).toBeUndefined();
  });
});

describe('mirrorKeysIntoFrontmatter', () => {
  it('replaces the keys the plugin wrote before, from the key list and its receipt', () => {
    const frontmatter: Record<string, unknown> = { 'aliases': ['Charlie', 'old', 'receipt'], 'keys': ['old', 7], 'keys-accepted': ['receipt'] };
    mirrorKeysIntoFrontmatter(frontmatter, 'keys', ['new']);
    expect(frontmatter['aliases']).toEqual(['Charlie', 'new']);
  });

  it('deletes an emptied alias list and leaves one it cannot edit', () => {
    const emptied: Record<string, unknown> = { aliases: ['old'], keys: ['old'] };
    mirrorKeysIntoFrontmatter(emptied, 'keys', []);
    expect(emptied).not.toHaveProperty('aliases');
    const odd: Record<string, unknown> = { aliases: 42, keys: 'old' };
    mirrorKeysIntoFrontmatter(odd, 'keys', ['new']);
    expect(odd['aliases']).toBe(42);
  });
});

describe('areKeysMirrored', () => {
  it('reports whether every key is an alias', () => {
    expect(areKeysMirrored(['Charlie', 'ABC'], ['abc'])).toBe(true);
    expect(areKeysMirrored('abc', ['abc', 'def'])).toBe(false);
    expect(areKeysMirrored(undefined, [])).toBe(true);
  });

  it('treats an aliases value it cannot edit as mirrored', () => {
    expect(areKeysMirrored(42, ['abc'])).toBe(true);
  });
});
