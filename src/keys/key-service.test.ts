import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { KeyService } from './key-service.ts';

function createService(raw: unknown = null): ServiceFixture {
  const files = new Map<string, unknown>([['note.md', undefined], ['report.pdf', undefined]]);
  const writeStore = vi.fn<(entries: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const writeNoteKeys = vi.fn((path: string, keys: readonly string[]): Promise<void> => {
    files.set(path, [...keys]);
    return noopAsync();
  });
  const service = new KeyService({
    fileExists: (path): boolean => files.has(path),
    getNotePaths: (): string[] => [...files.keys()].filter((path) => path.endsWith('.md')),
    notice: noop,
    readNoteKeys: (path): unknown => files.get(path),
    readNoteReceipt: (path): unknown => files.get(path),
    readStore: (): Promise<unknown> => Promise.resolve(raw),
    resolveKeyEdit: (): Promise<'revert'> => Promise.resolve('revert'),
    writeNoteKeys,
    writeStore
  });
  return { files, service, writeNoteKeys, writeStore };
}

describe('KeyService', () => {
  it('serializes competing transfers without losing destination aliases', async () => {
    const { files, service } = createService();
    files.set('target.md', undefined);
    await service.load();
    await service.addKey('note.md', 'note');
    await service.addKey('report.pdf', 'attachment');
    await Promise.all([service.moveKeys('note.md', 'target.md'), service.moveKeys('report.pdf', 'target.md')]);
    expect(service.getKeys('target.md')).toEqual(['note', 'attachment']);
    expect(files.get('target.md')).toEqual(['note', 'attachment']);
    expect(service.getKeys('note.md')).toEqual([]);
    expect(service.getKeys('report.pdf')).toEqual([]);
  });

  it('moves every alias after the target primary key and survives reconciliation and restart', async () => {
    const { files, service, writeStore } = createService();
    files.set('target.md', undefined);
    await service.load();
    await service.addKey('note.md', 'source');
    await service.addKey('note.md', 'alias');
    await service.addKey('target.md', 'primary');
    await service.moveKeys('note.md', 'target.md');
    expect(files.get('note.md')).toEqual([]);
    expect(files.get('target.md')).toEqual(['primary', 'source', 'alias']);
    await service.reconcile();
    expect(service.getKeys('note.md')).toEqual([]);
    expect(service.resolve('alias')?.path).toBe('target.md');
    const restarted = createService(writeStore.mock.lastCall?.[0]);
    restarted.files.set('target.md', ['primary', 'source', 'alias']);
    await restarted.service.load();
    expect(restarted.service.getKeys('target.md')).toEqual(['primary', 'source', 'alias']);
  });

  it('moves deleted source keys and attachment keys without requiring source frontmatter', async () => {
    const { files, service } = createService();
    await service.load();
    await service.addKey('note.md', 'deleted');
    files.delete('note.md');
    await service.deletePath('note.md');
    await service.moveKeys('note.md', 'report.pdf');
    expect(service.lookup('deleted')).toEqual({ key: 'deleted', path: 'report.pdf' });
    files.set('target.md', undefined);
    await service.moveKeys('report.pdf', 'target.md');
    expect(files.get('target.md')).toEqual(['deleted']);
    expect(service.getKeys('report.pdf')).toEqual([]);
  });

  it('does nothing for a self move or unkeyed source and rejects a missing target', async () => {
    const { service, writeNoteKeys, writeStore } = createService();
    await service.load();
    await service.addKey('note.md', 'source');
    writeNoteKeys.mockClear();
    writeStore.mockClear();
    await service.moveKeys('note.md', 'note.md');
    await service.moveKeys('report.pdf', 'note.md');
    expect(service.getKeys('note.md')).toEqual(['source']);
    expect(writeNoteKeys).not.toHaveBeenCalled();
    expect(writeStore).not.toHaveBeenCalled();
    await expect(service.moveKeys('note.md', 'missing.md')).rejects.toThrow('File no longer exists');
    expect(service.resolve('source')?.path).toBe('note.md');
  });

  it('keeps ownership when a destination write fails and can retry', async () => {
    const { files, service, writeNoteKeys } = createService();
    files.set('target.md', undefined);
    await service.load();
    await service.addKey('note.md', 'source');
    writeNoteKeys.mockRejectedValueOnce(new Error('write failed'));
    await expect(service.moveKeys('note.md', 'target.md')).rejects.toThrow('write failed');
    expect(service.resolve('source')?.path).toBe('note.md');
    await service.moveKeys('note.md', 'target.md');
    expect(service.resolve('source')?.path).toBe('target.md');
  });

  it('restores destination keys if clearing a live source fails', async () => {
    const { files, service, writeNoteKeys } = createService();
    files.set('target.md', undefined);
    await service.load();
    await service.addKey('note.md', 'source');
    await service.addKey('target.md', 'primary');
    writeNoteKeys.mockImplementationOnce((path, keys) => {
      files.set(path, [...keys]);
      return noopAsync();
    }).mockRejectedValueOnce(new Error('source write failed'));
    await expect(service.moveKeys('note.md', 'target.md')).rejects.toThrow('source write failed');
    expect(files.get('target.md')).toEqual(['primary']);
    expect(files.get('note.md')).toEqual(['source']);
    expect(service.resolve('source')?.path).toBe('note.md');
    await service.moveKeys('note.md', 'target.md');
    expect(service.resolve('source')?.path).toBe('target.md');
  });

  it('retries persistence after a failed store write even though ownership already moved', async () => {
    const { service, writeStore } = createService();
    await service.load();
    await service.addKey('note.md', 'source');
    writeStore.mockRejectedValueOnce(new Error('disk full'));
    await expect(service.moveKeys('note.md', 'report.pdf')).rejects.toThrow('disk full');
    await service.moveKeys('note.md', 'report.pdf');
    expect(writeStore).toHaveBeenLastCalledWith([{ key: 'source', path: 'report.pdf' }]);
  });

  it('retries a failed attachment store write before returning an existing key', async () => {
    const { service, writeStore } = createService();
    await service.load();
    writeStore.mockRejectedValueOnce(new Error('disk full'));
    await expect(service.addKey('report.pdf', 'report')).rejects.toThrow('disk full');
    expect(await service.assignKey('report.pdf')).toBe('report');
    expect(writeStore).toHaveBeenLastCalledWith([{ key: 'report', path: 'report.pdf' }]);
  });

  it('does not rewrite an unchanged store when ordinary note metadata changes', async () => {
    const { service, writeStore } = createService();
    await service.load();
    writeStore.mockClear();
    await service.reconcile(['note.md']);
    expect(writeStore).not.toHaveBeenCalled();
  });
  it('creates keys only on request, with frontmatter for notes and store-only attachments', async () => {
    const { files, service, writeNoteKeys, writeStore } = createService();
    await service.load();
    expect(service.getKeys('note.md')).toEqual([]);
    const key = await service.assignKey('note.md');
    expect(key).toMatch(/^[a-z0-9]{12}$/u);
    expect(files.get('note.md')).toEqual([key]);
    expect(await service.assignKey('note.md')).toBe(key);
    await service.addKey('report.pdf', 'Документ');
    expect(writeNoteKeys).toHaveBeenCalledTimes(1);
    expect(service.resolve('ДОКУМЕНТ')).toEqual({ key: 'Документ', path: 'report.pdf' });
    expect(writeStore).toHaveBeenLastCalledWith([{ key, path: 'note.md' }, { key: 'Документ', path: 'report.pdf' }]);
  });

  it('serializes competing assignments and rejects a normalized collision', async () => {
    const { service } = createService();
    await service.load();
    await Promise.all([service.addKey('note.md', 'é'), service.addKey('note.md', 'E\u{301}')]);
    expect(service.getKeys('note.md')).toEqual(['é']);
    await expect(service.addKey('report.pdf', 'É')).rejects.toThrow('already belongs');
    await service.addKey('report.pdf', 'another');
    expect(service.getKeys('report.pdf')).toEqual(['another']);
    const assigned = await Promise.all([service.assignKey('report.pdf'), service.assignKey('report.pdf')]);
    expect(assigned).toEqual(['another', 'another']);
  });

  it('removes only the selected key and preserves other keys', async () => {
    const { files, service } = createService();
    await service.load();
    await service.addKey('note.md', 'first');
    await service.addKey('note.md', 'second');
    await service.removeKey('report.pdf', 'first');
    expect(service.resolve('first')?.path).toBe('note.md');
    await service.removeKey('note.md', 'FIRST');
    expect(files.get('note.md')).toEqual(['second']);
    expect(service.resolve('first')).toBeUndefined();
    await service.removeKey('note.md', 'second');
    expect(files.get('note.md')).toEqual([]);
  });

  it('tracks file and folder moves and does not resolve deleted files', async () => {
    const { files, service } = createService([{ key: 'attachment', path: 'report.pdf' }]);
    await service.load();
    await service.addKey('note.md', 'unmoved');
    files.delete('report.pdf');
    files.set('folder/report.pdf', undefined);
    await service.rename('report.pdf', 'folder/report.pdf');
    expect(service.resolve('attachment')?.path).toBe('folder/report.pdf');
    files.delete('folder/report.pdf');
    files.set('moved/report.pdf', undefined);
    await service.rename('folder', 'moved');
    expect(service.resolve('attachment')?.path).toBe('moved/report.pdf');
    files.delete('moved/report.pdf');
    expect(service.resolve('attachment')).toBeUndefined();
    await expect(service.assignKey('missing.md')).rejects.toThrow('no longer exists');
  });

  it('rebuilds note mirrors and keeps the stored owner of a duplicate', async () => {
    const { files, service } = createService([{ key: 'old', path: 'note.md' }, { key: 'shared', path: 'other.md' }]);
    files.set('note.md', ['new', 'shared']);
    files.set('other.md', ['shared']);
    await service.load();
    expect(service.resolve('old')).toBeUndefined();
    expect(service.resolve('new')?.path).toBe('note.md');
    expect(service.resolve('shared')?.path).toBe('other.md');
    files.set('note.md', ['NEW']);
    await service.reconcile();
    expect(service.getKeys('note.md')).toEqual(['NEW']);
  });

  it('recovers a moved note from frontmatter when the stored path is gone', async () => {
    const { files, service } = createService([{ key: 'moved', path: 'gone.md' }]);
    files.set('note.md', ['moved']);
    await service.load();
    expect(service.resolve('moved')?.path).toBe('note.md');
  });

  it.each([{}, [null], [{ key: 1, path: 'note.md' }], [{ key: 'a', path: false }], [{ key: 'a' }]])('refuses corrupt store %j without overwriting it', async (raw) => {
    const { service, writeStore } = createService(raw);
    await expect(service.load()).rejects.toThrow('Invalid keys.json');
    expect(writeStore).not.toHaveBeenCalled();
  });

  it('refuses duplicate identities in a stored list', async () => {
    const { service } = createService([{ key: 'a', path: 'report.pdf' }, { key: 'A', path: 'else.pdf' }]);
    await expect(service.load()).rejects.toThrow('Duplicate key');
  });

  it.each(['scalar', [12], ['bad key']])('reports invalid note keys %j', async (value) => {
    const { files, service } = createService();
    files.set('note.md', value);
    await expect(service.load()).rejects.toThrow();
  });

  it('does not mutate the mirror when writing frontmatter fails', async () => {
    const { service, writeNoteKeys } = createService();
    await service.load();
    writeNoteKeys.mockRejectedValueOnce(new Error('read only'));
    await expect(service.addKey('note.md', 'key')).rejects.toThrow('read only');
    expect(service.getKeys('note.md')).toEqual([]);
    await service.addKey('note.md', 'key');
    writeNoteKeys.mockRejectedValueOnce(new Error('read only'));
    await expect(service.removeKey('note.md', 'key')).rejects.toThrow('read only');
    expect(service.getKeys('note.md')).toEqual(['key']);
  });
});

interface ServiceFixture {
  readonly files: Map<string, unknown>;
  readonly service: KeyService;
  readonly writeNoteKeys: import('vitest').Mock<ConstructorParameters<typeof KeyService>[0]['writeNoteKeys']>;
  readonly writeStore: import('vitest').Mock<ConstructorParameters<typeof KeyService>[0]['writeStore']>;
}
// Cspell:words Документ
