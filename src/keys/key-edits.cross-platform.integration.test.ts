import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it.each(['revert', 'redirect', 'keep', 'close', 'enter'])('handles a hand-edited key through the real %s dialog action', async (choice) => {
  const vaultPath = getTemporaryVault().path;
  const path = `Key edit ${choice}.md`;
  const oldKey = `before-${choice}`;
  const newKey = `after-${choice}`;
  await evalInObsidian({
    async callback({ app, ...input }): Promise<void> {
      await app.vault.create(input.path, `---\nkeys:\n  - ${input.oldKey}\n---\nPreserved body`);
    },
    input: { oldKey, path },
    vaultPath
  });
  await pollInObsidian({
    input: { oldKey, path },
    poll({ app, ...input }): boolean {
      const file = app.vault.getFileByPath(input.path);
      return JSON.stringify(file && app.metadataCache.getFileCache(file)?.frontmatter?.['keys-accepted']) === JSON.stringify([input.oldKey]);
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    async callback({ app, ...input }): Promise<void> {
      const file = app.vault.getFileByPath(input.path);
      if (!file) {
        throw new Error('Missing fixture');
      }
      // This is the disk change produced by a manual frontmatter edit, leaving the acceptance receipt intact.
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (typeof frontmatter !== 'object' || frontmatter === null) {
          throw new TypeError('Missing frontmatter');
        }
        Object.defineProperty(frontmatter, 'keys', { configurable: true, enumerable: true, value: [input.newKey], writable: true });
      });
    },
    input: { newKey, path },
    vaultPath
  });
  await pollInObsidian({
    poll(): boolean {
      return document.querySelector('.permanent-links-key-edit') !== null;
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    async callback({ lib: { clickElement, pressKey }, ...input }): Promise<void> {
      if (input.choice === 'enter' || input.choice === 'close') {
        await pressKey({ key: input.choice === 'enter' ? 'Enter' : 'Escape' });
        return;
      }
      const selector = `[data-choice="${input.choice}"]`;
      const button = document.querySelector(`.permanent-links-key-edit ${selector}`);
      if (!(button instanceof HTMLElement)) {
        throw new TypeError('Missing dialog action');
      }
      await clickElement({ element: button });
    },
    input: { choice },
    vaultPath
  });
  const expected = choice === 'keep' ? [newKey] : (choice === 'redirect' ? [newKey, oldKey] : [oldKey]);
  const content = await pollInObsidian({
    input: { expected, path },
    async poll({ app, ...input }): Promise<string> {
      const file = app.vault.getFileByPath(input.path);
      if (!file) {
        return '';
      }
      const cache = app.metadataCache.getFileCache(file)?.frontmatter;
      return JSON.stringify(cache?.['keys']) === JSON.stringify(input.expected) && JSON.stringify(cache?.['keys-accepted']) === JSON.stringify(input.expected)
        ? await app.vault.read(file)
        : '';
    },
    until: Boolean,
    vaultPath
  });
  expect(content).toContain('Preserved body');
});
