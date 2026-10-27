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
  readonly notice: ReturnType<typeof vi.fn<(message: string) => void>>;
  readonly receipts: Map<string, unknown>;
  readonly resolveKeyEdit: ReturnType<typeof vi.fn<ConstructorParameters<typeof KeyService>[0]['resolveKeyEdit']>>;
  readonly service: KeyService;
  readonly writeNoteKeys: ReturnType<typeof vi.fn<ConstructorParameters<typeof KeyService>[0]['writeNoteKeys']>>;
}

function fixture(): Fixture {
  const files = new Map<string, unknown>([['note.md', ['A']]]);
  const receipts = new Map<string, unknown>();
  const notice = vi.fn<(message: string) => void>();
  const resolveKeyEdit = vi.fn<ConstructorParameters<typeof KeyService>[0]['resolveKeyEdit']>().mockResolvedValue('revert');
  const writeNoteKeys = vi.fn(async (path: string, keys: readonly string[]): Promise<void> => {
    files.set(path, [...keys]);
    receipts.set(path, [...keys]);
    await noopAsync();
  });
  const service = new KeyService({
    fileExists: (path: string): boolean => files.has(path),
    getNotePaths: (): string[] => [...files.keys()],
    notice,
    readNoteKeys: (path: string): unknown => files.get(path),
    readNoteReceipt: (path: string): unknown => receipts.get(path),
    readStore: (): Promise<unknown> => Promise.resolve(null),
    resolveKeyEdit,
    writeNoteKeys,
    writeStore: noopAsync
  });
  return { files, notice, receipts, resolveKeyEdit, service, writeNoteKeys };
}

describe('frontmatter reconciliation', () => {
  it('reserves missing and deleted source identities when core merges their frontmatter into another note', async () => {
    const { files, service } = fixture();
    await service.load();
    files.delete('note.md');
    files.set('target.md', ['A', 'primary']);
    await service.reconcile(['target.md']);
    expect(service.getKeys('note.md')).toEqual(['A']);
    expect(files.get('target.md')).toEqual(['primary']);
    await service.reconcile(['target.md']);
    await service.deletePath('note.md');
    files.set('target.md', ['A', 'primary']);
    await service.reconcile(['target.md']);
    expect(service.lookup('A')?.deletedAt).toBeDefined();
    expect(files.get('target.md')).toEqual(['primary']);
    await service.moveKeys('note.md', 'target.md');
    expect(service.getKeys('target.md')).toEqual(['primary', 'A']);
  });
  it('ignores removed paths and delayed metadata from before a plugin write', async () => {
    const { files, resolveKeyEdit, service, writeNoteKeys } = fixture();
    await service.load();
    await service.reconcile(['note.md']);
    writeNoteKeys.mockImplementationOnce(() => noopAsync());
    await service.addKey('note.md', 'B');
    await service.reconcile(['note.md', 'gone.md']);
    expect(service.getKeys('note.md')).toEqual(['A', 'B']);
    expect(resolveKeyEdit).not.toHaveBeenCalled();
    files.set('note.md', ['A', 'B']);
    await service.reconcile(['note.md']);
    expect(service.getKeys('note.md')).toEqual(['A', 'B']);
  });

  it('accepts a first key and alias additions without a warning, and accepts deletion receipts', async () => {
    const { files, receipts, resolveKeyEdit, service, writeNoteKeys } = fixture();
    await service.load();
    files.set('new.md', ['first']);
    await service.reconcile(['new.md']);
    files.set('new.md', ['first', 'alias']);
    await service.reconcile(['new.md']);
    expect(service.getKeys('new.md')).toEqual(['first', 'alias']);
    expect(resolveKeyEdit).not.toHaveBeenCalled();
    files.set('new.md', undefined);
    receipts.set('new.md', []);
    await service.reconcile(['new.md']);
    writeNoteKeys.mockClear();
    await service.reconcile(['new.md']);
    expect(service.getKeys('new.md')).toEqual([]);
    expect(writeNoteKeys).not.toHaveBeenCalled();
  });

  it('discards the answer when the note was deleted during the dialog', async () => {
    const { files, resolveKeyEdit, service } = fixture();
    await service.load();
    files.set('note.md', []);
    resolveKeyEdit.mockImplementationOnce(() => {
      files.delete('note.md');
      return Promise.resolve('keep');
    });
    await service.reconcile(['note.md']);
    expect(service.lookup('A')?.path).toBe('note.md');
    expect(files.has('note.md')).toBe(false);
  });
  it('removes a duplicate claim from the copy and names both files', async () => {
    const { files, notice, service } = fixture();
    await service.load();
    files.set('copy.md', ['a', 'unique']);
    await service.reconcile(['copy.md']);
    expect(files.get('copy.md')).toEqual(['unique']);
    expect(service.resolve('A')?.path).toBe('note.md');
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('copy.md'));
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('note.md'));
  });

  it.each([
    ['revert', ['A']],
    ['redirect', ['B', 'A']],
    ['keep', ['B']]
  ])('applies the %s answer to a hand edit', async (choice, expected) => {
    const { files, receipts, resolveKeyEdit, service } = fixture();
    await service.load();
    resolveKeyEdit.mockResolvedValue(choice as 'keep' | 'redirect' | 'revert');
    files.set('note.md', ['B']);
    await service.reconcile(['note.md']);
    expect(resolveKeyEdit).toHaveBeenCalledWith('note.md', ['A'], ['B']);
    expect(files.get('note.md')).toEqual(expected);
    expect(receipts.get('note.md')).toEqual(expected);
    expect(service.getKeys('note.md')).toEqual(expected);
    await service.reconcile(['note.md']);
    expect(resolveKeyEdit).toHaveBeenCalledTimes(1);
  });

  it('accepts a synced answer without asking again', async () => {
    const { files, receipts, resolveKeyEdit, service } = fixture();
    await service.load();
    files.set('note.md', ['B']);
    receipts.set('note.md', ['B']);
    await service.reconcile(['note.md']);
    expect(service.getKeys('note.md')).toEqual(['B']);
    expect(resolveKeyEdit).not.toHaveBeenCalled();
  });

  it('reverts invalid edits and leaves an unkeyed invalid note untouched', async () => {
    const { files, notice, resolveKeyEdit, service } = fixture();
    await service.load();
    files.set('note.md', ['bad key']);
    await service.reconcile(['note.md']);
    expect(files.get('note.md')).toEqual(['A']);
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('Invalid'));
    expect(resolveKeyEdit).not.toHaveBeenCalled();
    files.set('new.md', 'bad');
    await expect(service.reconcile(['new.md'])).rejects.toThrow();
    expect(files.get('new.md')).toBe('bad');
  });

  it('does not apply a stale dialog answer to a newer edit', async () => {
    const { files, resolveKeyEdit, service } = fixture();
    await service.load();
    files.set('note.md', ['B']);
    resolveKeyEdit.mockImplementationOnce(() => {
      files.set('note.md', ['C']);
      return Promise.resolve('revert');
    });
    await service.reconcile(['note.md']);
    expect(files.get('note.md')).toEqual(['C']);
    await service.reconcile(['note.md']);
    expect(files.get('note.md')).toEqual(['A']);
  });
});
