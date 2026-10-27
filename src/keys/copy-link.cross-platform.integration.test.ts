import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it('copies a permanent URI on request and keeps the key through a rename', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const file = await app.vault.create('Copy link.md', 'Body');
      await app.workspace.getLeaf(false).openFile(file);
      app.commands.executeCommandById('permanent-links:copy-permanent-link');
    },
    vaultPath
  });
  const content = await pollInObsidian({
    async poll({ app }): Promise<string> {
      const file = app.vault.getFileByPath('Copy link.md');
      return file ? await app.vault.read(file) : '';
    },
    until: (value) => /keys:\s*\n\s*- [a-z0-9]{12}/u.test(value),
    vaultPath
  });
  expect(content).toMatch(/keys:\s*\n\s*- [a-z0-9]{12}/u);
  const assignedKey = ensureNonNullable(/- (?<key>[a-z0-9]{12})/u.exec(content)?.groups?.['key']);
  const link = await pollInObsidian({
    async poll(): Promise<string> {
      return await navigator.clipboard.readText();
    },
    until: (value) => value.startsWith('obsidian://permanent-links?') && value.endsWith(`&key=${assignedKey}`),
    vaultPath
  });
  expect(link).toMatch(/^obsidian:\/\/permanent-links\?vault=.+&key=[a-z0-9]{12}$/u);
  const key = new URL(link).searchParams.get('key');
  expect(content).toContain(key);
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const file = app.vault.getFileByPath('Copy link.md');
      if (!file) {
        throw new Error('Missing fixture');
      }
      await app.vault.rename(file, 'Renamed copy link.md');
    },
    vaultPath
  });
  const store = await pollInObsidian({
    async poll({ app }): Promise<string> {
      return await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`);
    },
    until: (value) => value.includes('Renamed copy link.md'),
    vaultPath
  });
  expect(store).toContain(key);
});
