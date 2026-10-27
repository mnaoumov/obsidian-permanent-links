import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it.each(['move', 'cancel', 'close', 'stale', 'toggle', 'disable', 'unload'])('handles a real Note Composer merge: %s', async (choice) => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app, scenario }): Promise<void> {
      const core = app.internalPlugins.getPluginById('note-composer');
      if (!core) {
        throw new Error('Missing Note Composer');
      }
      await core.enable();
      if (scenario === 'toggle') {
        core.disable();
        await core.enable();
      }
      await app.vault.create(`Merge source ${scenario}.md`, `---\nkeys: [source-${scenario}, alias-${scenario}]\n---\nSource body ${scenario}`);
      await app.vault.create(`Merge target ${scenario}.md`, `---\nkeys: [primary-${scenario}]\n---\nTarget body ${scenario}`);
    },
    input: { scenario: choice },
    vaultPath
  });
  await pollInObsidian({
    input: { scenario: choice },
    poll({ app, scenario }): boolean {
      const file = app.vault.getFileByPath(`Merge source ${scenario}.md`);
      const target = app.vault.getFileByPath(`Merge target ${scenario}.md`);
      return Boolean(file && target && app.metadataCache.getFileCache(file)?.frontmatter?.['keys-accepted'] && app.metadataCache.getFileCache(target)?.frontmatter?.['keys-accepted']);
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    async callback({ app, scenario }): Promise<void> {
      const source = app.vault.getFileByPath(`Merge source ${scenario}.md`);
      const target = app.vault.getFileByPath(`Merge target ${scenario}.md`);
      const composer = app.internalPlugins.getEnabledPluginById('note-composer');
      if (!source || !target || !composer) {
        throw new Error('Missing merge fixture');
      }
      await app.workspace.getLeaf(false).openFile(source);
      await composer.mergeFile(target, source, 'append');
    },
    input: { scenario: choice },
    vaultPath
  });
  await pollInObsidian({
    poll(): boolean {
      return document.querySelector('.confirm-modal')?.textContent.includes('Preserve permanent links?') ?? false;
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    async callback({ app, lib: { pressKey }, scenario }): Promise<void> {
      switch (scenario) {
        case 'close': {
          await pressKey({ key: 'Escape' });
          return;
        }
        case 'disable': {
          app.internalPlugins.getPluginById('note-composer')?.disable();
          break;
        }
        case 'stale': {
          await app.vault.create(`Merge source ${scenario}.md`, '---\nkeys: [source-stale, alias-stale]\nkeys-accepted: [source-stale, alias-stale]\n---\nRecreated source');
          break;
        }
        case 'unload': {
          await app.plugins.disablePlugin('permanent-links');
          break;
        }
          // No default
      }
      const selector = scenario === 'cancel' ? '.confirm-modal .cancel-button' : '.confirm-modal .ok-button';
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLElement)) {
        throw new TypeError('Missing merge choice');
      }
      button.click();
    },
    input: { scenario: choice },
    vaultPath
  });
  const content = await pollInObsidian({
    input: { scenario: choice },
    async poll({ app, scenario }): Promise<string> {
      const target = app.vault.getFileByPath(`Merge target ${scenario}.md`);
      return target ? app.vault.read(target) : '';
    },
    until: (value) => choice === 'move' || choice === 'toggle' ? value.includes(`alias-${choice}`) : value.includes(`Source body ${choice}`),
    vaultPath
  });
  const records = await evalInObsidian({
    async callback({ app }): Promise<unknown> {
      return JSON.parse(await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`)) as unknown;
    },
    vaultPath
  });
  const destination = choice === 'move' || choice === 'toggle' ? `Merge target ${choice}.md` : `Merge source ${choice}.md`;
  expect(records).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: `source-${choice}`, path: destination }),
    expect.objectContaining({ key: `alias-${choice}`, path: destination })
  ]));
  expect(content).toContain(`Target body ${choice}`);
  expect(content).toContain(`Source body ${choice}`);
  if (choice === 'move' || choice === 'toggle') {
    expect(content.indexOf(`primary-${choice}`)).toBeLessThan(content.indexOf(`source-${choice}`));
    expect(content).toContain(`alias-${choice}`);
  } else {
    expect(content).not.toContain(`alias-${choice}`);
  }
});

it('preserves source identities when the real core merge rejects', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      await app.plugins.enablePlugin('permanent-links');
      await app.internalPlugins.getPluginById('note-composer')?.enable();
      await app.vault.create('Rejected source.md', '---\nkeys: [rejected-source]\n---\nSource');
    },
    vaultPath
  });
  await pollInObsidian({
    poll({ app }): boolean {
      const file = app.vault.getFileByPath('Rejected source.md');
      return Boolean(file && app.metadataCache.getFileCache(file)?.frontmatter?.['keys-accepted']);
    },
    until: Boolean,
    vaultPath
  });
  const didReject = await evalInObsidian({
    async callback({ app }): Promise<boolean> {
      const source = app.vault.getFileByPath('Rejected source.md');
      const composer = app.internalPlugins.getEnabledPluginById('note-composer');
      if (!source || !composer) {
        throw new Error('Missing rejection fixture');
      }
      const target = await app.vault.create('Rejected target.md', 'Target');
      await app.fileManager.trashFile(target);
      try {
        await composer.mergeFile(target, source);
      } catch {
        return app.vault.getFileByPath(source.path) === source && document.querySelector('.confirm-modal') === null;
      }
      return false;
    },
    vaultPath
  });
  expect(didReject).toBe(true);
});
