import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  formatKeyFilesResult,
  isInFolder,
  keyFiles
} from './bulk-keys.ts';

describe('isInFolder', () => {
  it('matches files at any depth under the folder only', () => {
    expect(isInFolder('Notes/a.md', 'Notes')).toBe(true);
    expect(isInFolder('Notes/deep/b.pdf', 'Notes')).toBe(true);
    expect(isInFolder('Notes2/c.md', 'Notes')).toBe(false);
    expect(isInFolder('Notes', 'Notes')).toBe(false);
  });

  it('treats the vault root as containing every path', () => {
    expect(isInFolder('a.md', '/')).toBe(true);
    expect(isInFolder('x/a.md', '')).toBe(true);
  });
});

describe('keyFiles', () => {
  it('keys only existing unkeyed files, in order, and keeps going past a failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const assigned: string[] = [];
    const result = await keyFiles({
      assignKey: (path) => {
        if (path === 'bad.md') {
          return Promise.reject(new Error('malformed'));
        }
        assigned.push(path);
        return Promise.resolve('key');
      },
      fileExists: (path) => path !== 'gone.md',
      hasKeys: (path) => path === 'keyed.md',
      paths: ['a.md', 'keyed.md', 'gone.md', 'bad.md', 'b.pdf']
    });
    expect(assigned).toEqual(['a.md', 'b.pdf']);
    expect(result).toEqual({ failedPaths: ['bad.md'], keyedCount: 2 });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('bad.md'), expect.any(Error));
    error.mockRestore();
  });
});

describe('formatKeyFilesResult', () => {
  it('counts files with the right noun', () => {
    expect(formatKeyFilesResult({ failedPaths: [], keyedCount: 1 }, 'folder Notes')).toBe('Gave permanent keys to 1 file in folder Notes.');
    expect(formatKeyFilesResult({ failedPaths: [], keyedCount: 3 }, 'the vault')).toBe('Gave permanent keys to 3 files in the vault.');
  });

  it('names at most three failed files', () => {
    expect(formatKeyFilesResult({ failedPaths: ['a.md'], keyedCount: 0 }, 'the vault')).toBe(
      'Gave permanent keys to 0 files in the vault. Could not key 1: a.md. See the console for the errors.'
    );
    expect(formatKeyFilesResult({ failedPaths: ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'], keyedCount: 2 }, 'the vault')).toBe(
      'Gave permanent keys to 2 files in the vault. Could not key 5: a.md, b.md, c.md and 2 more. See the console for the errors.'
    );
  });
});
