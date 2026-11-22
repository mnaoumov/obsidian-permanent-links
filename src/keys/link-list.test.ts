import {
  describe,
  expect,
  it
} from 'vitest';

import { formatLinkList } from './link-list.ts';

describe('formatLinkList', () => {
  it('writes one Markdown link line per file in order', () => {
    expect(formatLinkList([
      { link: 'obsidian://permanent-links?vault=V&key=a', name: 'Alpha' },
      { link: 'obsidian://permanent-links?vault=V&key=b', name: 'report.pdf' }
    ])).toBe('- [Alpha](obsidian://permanent-links?vault=V&key=a)\n- [report.pdf](obsidian://permanent-links?vault=V&key=b)');
  });

  it('escapes brackets and backslashes in names and encodes parentheses in links', () => {
    expect(formatLinkList([{ link: 'obsidian://permanent-links?vault=My(Vault)&key=a', name: 'a [b] \\ c' }]))
      .toBe('- [a \\[b\\] \\\\ c](obsidian://permanent-links?vault=My%28Vault%29&key=a)');
  });

  it('returns an empty string for no files', () => {
    expect(formatLinkList([])).toBe('');
  });
});
