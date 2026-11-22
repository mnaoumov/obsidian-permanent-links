import type {
  CachedMetadata,
  Pos
} from 'obsidian';

import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  findSubpathTarget,
  generateBlockId
} from './subpath-target.ts';

function pos(startLine: number, endLine: number, endOffset = 0): Pos {
  return {
    end: { col: 0, line: endLine, offset: endOffset },
    start: { col: 0, line: startLine, offset: 0 }
  };
}

const CACHE: CachedMetadata = {
  blocks: {
    keep: { id: 'Keep', position: pos(8, 8, 80) }
  },
  headings: [{ heading: 'Plan', level: 1, position: pos(3, 3, 30) }],
  listItems: [
    { parent: -10, position: pos(10, 10, 100) },
    { parent: 10, position: pos(11, 11, 110) }
  ],
  sections: [
    { position: pos(0, 2, 20), type: 'yaml' },
    { position: pos(3, 3, 30), type: 'heading' },
    { position: pos(4, 5, 50), type: 'paragraph' },
    { position: pos(6, 7, 70), type: 'table' },
    { position: pos(8, 8, 80), type: 'paragraph' },
    { position: pos(10, 11, 110), type: 'list' }
  ]
};

function find(line: number, cache: CachedMetadata | null = CACHE, ids: string[] = ['abc123']): ReturnType<typeof findSubpathTarget> {
  return findSubpathTarget({ cache, generateBlockId: vi.fn(() => ids.shift() ?? 'zzz999'), line });
}

describe('findSubpathTarget', () => {
  it('returns the heading on a heading line', () => {
    expect(find(3)).toEqual({ heading: 'Plan', kind: 'heading' });
  });

  it('returns null without a cache, on a blank line, in the frontmatter or on a heading section without a heading', () => {
    expect(find(4, null)).toBeNull();
    expect(find(9)).toBeNull();
    expect(find(1)).toBeNull();
    expect(find(3, { sections: CACHE.sections ?? [] })).toBeNull();
  });

  it('reuses an existing block id', () => {
    expect(find(8)).toEqual({ blockId: 'Keep', insertion: null, insertOffset: 80, kind: 'block' });
  });

  it('appends a new id to the end of a paragraph', () => {
    expect(find(5)).toEqual({ blockId: 'abc123', insertion: ' ^abc123', insertOffset: 50, kind: 'block' });
  });

  it('puts a new id on its own line after a table', () => {
    expect(find(6)).toEqual({ blockId: 'abc123', insertion: '\n\n^abc123', insertOffset: 70, kind: 'block' });
  });

  it('targets the innermost list item and skips an id already used in the note', () => {
    expect(find(11, CACHE, ['keep', 'new111'])).toEqual({ blockId: 'new111', insertion: ' ^new111', insertOffset: 110, kind: 'block' });
  });

  it('falls back to the section when no list item is cached', () => {
    expect(find(10, { sections: CACHE.sections ?? [] })).toEqual({ blockId: 'abc123', insertion: ' ^abc123', insertOffset: 110, kind: 'block' });
  });
});

describe('generateBlockId', () => {
  it('generates six characters from a-z0-9', () => {
    expect(generateBlockId()).toMatch(/^[a-z0-9]{6}$/u);
  });
});
