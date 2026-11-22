import {
  describe,
  expect,
  it
} from 'vitest';

import {
  buildPermanentLink,
  isValidRedirectorBaseUrl
} from './permanent-link.ts';

describe('buildPermanentLink', () => {
  it('builds the obsidian:// link without a redirector', () => {
    expect(buildPermanentLink({ key: '文字', redirectorBaseUrl: '  ', vault: 'My vault' }))
      .toBe('obsidian://permanent-links?vault=My%20vault&key=%E6%96%87%E5%AD%97');
  });

  it('appends the query to a redirector base URL', () => {
    expect(buildPermanentLink({ key: 'abc', redirectorBaseUrl: ' https://links.example.com/open ', vault: 'V' }))
      .toBe('https://links.example.com/open?vault=V&key=abc');
  });

  it('joins a base URL that already has a query with &', () => {
    expect(buildPermanentLink({ key: 'abc', redirectorBaseUrl: 'https://example.com/r?to=obsidian', vault: 'V' }))
      .toBe('https://example.com/r?to=obsidian&vault=V&key=abc');
  });

  it('adds no separator after a trailing ? or &', () => {
    expect(buildPermanentLink({ key: 'abc', redirectorBaseUrl: 'https://example.com/r?', vault: 'V' }))
      .toBe('https://example.com/r?vault=V&key=abc');
    expect(buildPermanentLink({ key: 'abc', redirectorBaseUrl: 'https://example.com/r?a=1&', vault: 'V' }))
      .toBe('https://example.com/r?a=1&vault=V&key=abc');
  });
});

describe('buildPermanentLink subpaths', () => {
  it('appends a block, or else a heading', () => {
    expect(buildPermanentLink({ block: 'abc123', heading: 'Ignored', key: 'k', redirectorBaseUrl: '', vault: 'V' }))
      .toBe('obsidian://permanent-links?vault=V&key=k&block=abc123');
    expect(buildPermanentLink({ heading: 'A & B', key: 'k', redirectorBaseUrl: 'https://example.com/r', vault: 'V' }))
      .toBe('https://example.com/r?vault=V&key=k&heading=A%20%26%20B');
  });
});

describe('isValidRedirectorBaseUrl', () => {
  it('accepts an empty value and http or https URLs', () => {
    expect(isValidRedirectorBaseUrl('')).toBe(true);
    expect(isValidRedirectorBaseUrl('http://localhost:8787')).toBe(true);
    expect(isValidRedirectorBaseUrl('https://links.example.com/open')).toBe(true);
  });

  it('refuses a fragment, another scheme and a relative value', () => {
    expect(isValidRedirectorBaseUrl('https://example.com/#open')).toBe(false);
    expect(isValidRedirectorBaseUrl('obsidian://permanent-links')).toBe(false);
    expect(isValidRedirectorBaseUrl('links.example.com')).toBe(false);
    expect(isValidRedirectorBaseUrl('https://')).toBe(false);
    expect(isValidRedirectorBaseUrl('https://example.com/a b')).toBe(false);
  });
});
