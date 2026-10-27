import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { getStartupNotePaths } from './startup-note-paths.ts';

vi.mock('@mnaoumov/obsidian-lib/plugin/plugin-api', () => ({ findPluginApi: vi.fn() }));

describe('startup note paths', () => {
  afterEach(() => vi.resetAllMocks());

  it('registers the configured property and waits for the current index without walking', async () => {
    const app = App.createConfigured__().asOriginalType__();
    const walk = vi.spyOn(app.vault, 'getMarkdownFiles');
    const registerPropertyName = vi.fn();
    let complete = fail;
    const getPathsWithPropertySafe = vi.fn(() =>
      new Promise<string[]>((resolve) => {
        complete = resolve;
      })
    );
    vi.mocked(findPluginApi).mockReturnValue({ getPathsWithPropertySafe, registerPropertyName });
    const result = getStartupNotePaths(app, 'identities');
    expect(registerPropertyName).toHaveBeenCalledWith('identities');
    expect(getPathsWithPropertySafe).toHaveBeenCalledWith('identities');
    expect(walk).not.toHaveBeenCalled();
    complete(['alpha.md']);
    await expect(result).resolves.toEqual(['alpha.md']);
    expect(findPluginApi).toHaveBeenCalledWith({ apiVersionRange: '^1.4.0', pluginId: 'advanced-metadata-cache' });

    function fail(_paths: string[]): void {
      throw new Error('Lookup not started');
    }
  });

  it('accepts an empty index without walking', async () => {
    const app = App.createConfigured__().asOriginalType__();
    const walk = vi.spyOn(app.vault, 'getMarkdownFiles');
    vi.mocked(findPluginApi).mockReturnValue({ getPathsWithPropertySafe: () => Promise.resolve([]), registerPropertyName: vi.fn() });
    await expect(getStartupNotePaths(app, 'keys')).resolves.toEqual([]);
    expect(walk).not.toHaveBeenCalled();
  });

  it.each(['absent', 'disabled', 'registration failure', 'lookup failure', 'revoked'])('walks once when the index is %s', async (scenario) => {
    const app = App.createConfigured__().asOriginalType__();
    await app.vault.create('alpha.md', 'Body');
    await app.vault.create('bravo.png', 'Attachment');
    const walk = vi.spyOn(app.vault, 'getMarkdownFiles');
    if (scenario === 'absent') {
      vi.mocked(findPluginApi).mockReturnValue(null);
    } else if (scenario === 'revoked') {
      vi.mocked(findPluginApi).mockImplementation(fail);
    } else {
      vi.mocked(findPluginApi).mockReturnValue({
        getPathsWithPropertySafe: scenario === 'lookup failure' ? fail : (): Promise<null> => Promise.resolve(null),
        registerPropertyName: scenario === 'registration failure' ? fail : vi.fn()
      });
    }
    await expect(getStartupNotePaths(app, 'keys')).resolves.toEqual(['alpha.md']);
    expect(walk).toHaveBeenCalledTimes(1);

    function fail(): never {
      throw new Error('Provider unavailable');
    }
  });
});
