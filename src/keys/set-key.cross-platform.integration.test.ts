import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it('sets a Unicode key through the real prompt and preserves the note body', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const file = await app.vault.create('Set key.md', 'Original body');
      await app.workspace.getLeaf(false).openFile(file);
      app.commands.executeCommandById('permanent-links:set-key');
    },
    vaultPath
  });
  await pollInObsidian({
    poll(): boolean {
      return document.querySelector('.prompt-modal input') !== null;
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    callback(): void {
      const input = document.querySelector('.prompt-modal input');
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('Missing prompt');
      }
      input.value = '文字-é';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    vaultPath
  });
  await pollInObsidian({
    poll(): boolean {
      return document.querySelector('.prompt-modal input:valid') !== null;
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    callback(): void {
      const button = document.querySelector('.prompt-modal .ok-button');
      if (!(button instanceof HTMLElement)) {
        throw new TypeError('Missing OK button');
      }
      button.click();
    },
    vaultPath
  });
  const content = await pollInObsidian({
    async poll({ app }): Promise<string> {
      const file = app.vault.getFileByPath('Set key.md');
      return file ? await app.vault.read(file) : '';
    },
    until: (value) => value.includes('文字-é'),
    vaultPath
  });
  expect(content).toContain('Original body');
  expect(content).toContain('文字-é');
});
