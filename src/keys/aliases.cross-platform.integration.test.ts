import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it('mirrors a note key into aliases beside the user alias', async () => {
  const vaultPath = getTemporaryVault().path;
  async function setMirroring(shouldMirror: boolean): Promise<void> {
    await evalInObsidian({
      async callback({ app, ...input }): Promise<void> {
        const plugins: unknown = Reflect.get(app.plugins, 'plugins');
        const plugin: unknown = plugins && Reflect.get(plugins, 'permanent-links');
        const settings: unknown = plugin && Reflect.get(plugin, 'pluginSettingsComponent');
        const editAndSave: unknown = settings && Reflect.get(settings, 'editAndSave');
        if (typeof editAndSave !== 'function') {
          throw new TypeError('Missing plugin settings');
        }
        await (editAndSave as (edit: (draft: Record<string, unknown>) => void) => Promise<void>).call(settings, (draft) => {
          draft['shouldMirrorKeysToAliases'] = input.shouldMirror;
        });
      },
      input: { shouldMirror },
      vaultPath
    });
  }
  await setMirroring(true);
  try {
    await evalInObsidian({
      async callback({ app }): Promise<void> {
        await app.vault.create('Mirrored.md', '---\naliases:\n  - Mine\nkeys:\n  - mirrored-key\n---\nBody');
      },
      vaultPath
    });
    const aliases = await pollInObsidian({
      poll({ app }): unknown {
        const file = app.vault.getFileByPath('Mirrored.md');
        return file ? app.metadataCache.getFileCache(file)?.frontmatter?.['aliases'] : undefined;
      },
      until: (value) => Array.isArray(value) && value.length === 2,
      vaultPath
    });
    expect(aliases).toEqual(['Mine', 'mirrored-key']);
  } finally {
    await setMirroring(false);
  }
});
