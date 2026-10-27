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

describe('indexed startup reconciliation', () => {
  it('clears offline property removals, imports candidates and preserves attachments and missing paths', async () => {
    const notes = new Map<string, unknown>([['alpha.md', undefined], ['bravo.md', ['new']], ['image.png', undefined], ['plain.md', undefined]]);
    const readNoteKeys = vi.fn((path: string): unknown => notes.get(path));
    const writeNoteKeys = vi.fn((path: string, keys: readonly string[]): Promise<void> => {
      notes.set(path, [...keys]);
      return noopAsync();
    });
    const service = new KeyService({
      fileExists: (path): boolean => notes.has(path),
      getNotePaths: (): Promise<string[]> => Promise.resolve(['bravo.md', 'bravo.md', 'missing.md']),
      notice: noop,
      readNoteKeys,
      readNoteReceipt: (path): unknown => notes.get(path),
      readStore: (): Promise<unknown> =>
        Promise.resolve([
          { key: 'old', path: 'alpha.md' },
          { key: 'attachment', path: 'image.png' },
          { key: 'missing', path: 'missing.md' },
          { deletedAt: '2026-10-25T00:00:00.000Z', key: 'deleted', path: 'deleted.md' }
        ]),
      resolveKeyEdit: (): Promise<'revert'> => Promise.resolve('revert'),
      writeNoteKeys,
      writeStore: noopAsync
    });
    await service.load();
    expect(service.lookup('old')).toBeUndefined();
    expect(service.resolve('new')?.path).toBe('bravo.md');
    expect(service.resolve('attachment')?.path).toBe('image.png');
    expect(service.lookup('missing')?.path).toBe('missing.md');
    expect(service.lookup('deleted')?.deletedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(readNoteKeys.mock.calls).toEqual([['bravo.md'], ['alpha.md']]);
    expect(writeNoteKeys).not.toHaveBeenCalled();
    notes.set('plain.md', ['later']);
    await service.reconcile(['plain.md']);
    expect(service.resolve('later')?.path).toBe('plain.md');
  });
});
