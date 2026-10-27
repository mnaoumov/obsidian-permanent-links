import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { LinkResolver } from './link-resolver.ts';

interface Entry {
  readonly deletedAt?: string;
  readonly path: string;
}
interface Fixture {
  readonly entries: Map<string, Entry>;
  readonly files: Map<string, string>;
  readonly missing: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly notice: ReturnType<typeof vi.fn<(message: string) => void>>;
  readonly open: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly resolver: LinkResolver;
}

function fixture(): Fixture {
  const open = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const notice = vi.fn<(message: string) => void>();
  const entries = new Map<string, Entry>();
  const files = new Map<string, string>();
  const missing = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const resolver = new LinkResolver({
    fileExists: (path): boolean => files.has(path),
    getFilePaths: (): string[] => [...files.keys()],
    getVaultName: (): string => 'Vault',
    lookup: (key): Entry | undefined => entries.get(key),
    missing,
    notice,
    open,
    shouldUseFileName: (): boolean => true
  });
  return { entries, files, missing, notice, open, resolver };
}

describe('LinkResolver', () => {
  it('opens known keys after renames and passes query parameters to the viewer', async () => {
    const { entries, files, open, resolver } = fixture();
    entries.set('key', { path: 'folder/index.md' });
    files.set('folder/index.md', '');
    await resolver.resolve({ heading: 'Title', key: 'key', vault: 'Vault' });
    expect(open).toHaveBeenCalledWith('folder/index.md', { heading: 'Title', key: 'key', vault: 'Vault' });
    await resolver.resolve({ key: 'key', vault: 'Other' });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reports invalid, unknown, deleted and unresolved keys without using name fallback for reserved identities', async () => {
    const { entries, files, missing, notice, open, resolver } = fixture();
    await resolver.resolve({});
    expect(notice).toHaveBeenLastCalledWith('The permanent link has no key.');
    await resolver.resolve({ key: 'bad key' });
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('Invalid'));
    await resolver.resolve({ key: 'unknown' });
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('Unknown'));
    entries.set('gone', { deletedAt: '2026-10-25T00:00:00.000Z', path: 'old/gone.pdf' });
    files.set('gone.pdf', '');
    await resolver.resolve({ key: 'gone' });
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('2026-10-25'));
    entries.set('missing', { path: 'lost/file.md' });
    await resolver.resolve({ key: 'missing' });
    expect(missing).toHaveBeenCalledWith('lost/file.md');
    expect(open).not.toHaveBeenCalled();
  });

  it('opens only unique normalized basenames and names every ambiguous candidate', async () => {
    const { files, notice, open, resolver } = fixture();
    files.set('plain', '');
    files.set('.hidden', '');
    files.set('ordinary name.pdf', '');
    files.set('one/É.pdf', '');
    await resolver.resolve({ key: 'e\u{301}' });
    expect(open).toHaveBeenCalledWith('one/É.pdf', { key: 'e\u{301}' });
    files.set('two/é.md', '');
    await resolver.resolve({ key: 'é' });
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('one/É.pdf\ntwo/é.md'));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
