import { noopAsync } from '@mnaoumov/typescript-lib/function';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { KeyService } from './key-service.ts';

interface Fixture {
  readonly files: Map<string, unknown>;
  readonly service: KeyService;
  readonly writeStore: ReturnType<typeof vi.fn<(entries: unknown) => Promise<void>>>;
}

function fixture(raw: unknown = null): Fixture {
  const files = new Map<string, unknown>([['image.png', undefined], ['note.md', ['note']]]);
  const writeStore = vi.fn<(entries: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const service = new KeyService({
    fileExists: (path): boolean => files.has(path),
    getNotePaths: (): string[] => [...files.keys()].filter((path) => path.endsWith('.md')),
    readNoteKeys: (path): unknown => files.get(path),
    readStore: (): Promise<unknown> => Promise.resolve(raw),
    writeNoteKeys: (path, keys): Promise<void> => {
      files.set(path, [...keys]);
      return noopAsync();
    },
    writeStore
  });
  return { files, service, writeStore };
}

describe('tombstones', () => {
  it('does not persist startup revival before note validation succeeds', async () => {
    const { files, service, writeStore } = fixture([{ deletedAt: '2026-10-25T00:00:00.000Z', key: 'picture', path: 'image.png' }]);
    files.set('note.md', 'malformed');
    await expect(service.load()).rejects.toThrow('list of strings');
    expect(writeStore).not.toHaveBeenCalled();
  });
  it('records deletion once, reserves aliases, survives reload and revives attachments', async () => {
    const { files, service, writeStore } = fixture();
    await service.load();
    await service.addKey('image.png', 'picture');
    files.delete('image.png');
    await service.deletePath('image.png');
    const tombstone = service.lookup('PICTURE');
    expect(tombstone?.deletedAt).toMatch(/^\d{4}-/u);
    expect(tombstone?.path).toBe('image.png');
    expect(service.resolve('picture')).toBeUndefined();
    await service.deletePath('image.png');
    expect(service.lookup('picture')).toEqual(tombstone);
    await expect(service.addKey('note.md', 'picture')).rejects.toThrow('already belongs');
    const restored = fixture(writeStore.mock.lastCall?.[0]);
    restored.files.delete('image.png');
    await restored.service.load();
    expect(restored.service.listTombstones()).toContainEqual(tombstone);
    restored.files.set('image.png', undefined);
    await restored.service.revivePath('image.png');
    expect(restored.service.resolve('picture')).toEqual({ key: 'picture', path: 'image.png' });
  });

  it('purges only still-deleted selected entries and preserves live keys', async () => {
    const { files, service } = fixture();
    await service.load();
    files.delete('note.md');
    await service.deletePath('note.md');
    await service.purgeTombstones(['unknown']);
    expect(service.lookup('note')).toBeDefined();
    files.set('note.md', ['note']);
    await service.purgeTombstones(['note']);
    expect(service.lookup('note')).toBeDefined();
    files.delete('note.md');
    await service.purgeTombstones(['NOTE']);
    expect(service.lookup('note')).toBeUndefined();
  });

  it('keeps unobserved missing entries distinct from confirmed deletions', async () => {
    const { service } = fixture([{ key: 'lost', path: 'folder/sub/lost.pdf' }, { key: 'other', path: 'folder/other.pdf' }]);
    await service.load();
    expect(service.lookup('lost')).toEqual({ key: 'lost', path: 'folder/sub/lost.pdf' });
    expect(service.listTombstones()).toEqual([]);
    expect(service.resolve('lost')).toBeUndefined();
  });

  it.each([{ deletedAt: 'bad' }, { deletedAt: 12 }])('refuses malformed state %j', async (state) => {
    const { service, writeStore } = fixture([{ key: 'bad', path: 'lost.pdf', ...state }]);
    await expect(service.load()).rejects.toThrow('Invalid keys.json');
    expect(writeStore).not.toHaveBeenCalled();
  });
});
