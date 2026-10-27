import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it('removes a key only after the real confirmation dialog is accepted', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      await app.vault.create('Remove key.md', '---\nkeys:\n  - remove-me\n---\nPreserved body');
      await app.plugins.disablePlugin('permanent-links');
      await app.plugins.enablePlugin('permanent-links');
      const file = app.vault.getFileByPath('Remove key.md');
      if (!file) {
        throw new Error('Missing fixture');
      }
      await app.workspace.getLeaf(false).openFile(file);
    },
    vaultPath
  });
  await pollInObsidian({
    poll({ app }): boolean {
      return app.commands.commands['permanent-links:remove-key'] !== undefined;
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    callback({ app }): void {
      app.commands.executeCommandById('permanent-links:remove-key');
    },
    vaultPath
  });
  const before = await pollInObsidian({
    poll(): string {
      return document.querySelector('.confirm-modal')?.textContent ?? '';
    },
    until: (value) => value.includes('remove-me'),
    vaultPath
  });
  expect(before).toContain('Every external link');
  await evalInObsidian({
    callback(): void {
      const button = document.querySelector('.confirm-modal .ok-button');
      if (!(button instanceof HTMLElement)) {
        throw new TypeError('Missing confirmation');
      }
      button.click();
    },
    vaultPath
  });
  const content = await pollInObsidian({
    async poll({ app }): Promise<string> {
      const file = app.vault.getFileByPath('Remove key.md');
      return file ? await app.vault.read(file) : '';
    },
    until: (value) => !value.includes('remove-me'),
    vaultPath
  });
  expect(content).toContain('Preserved body');
  expect(content).not.toContain('remove-me');
});
