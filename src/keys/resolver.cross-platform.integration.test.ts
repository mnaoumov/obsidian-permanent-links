import type { ObsidianProtocolData } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it('resolves a key after moving into a folder note, records deletion and revives the restored note', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const file = await app.vault.create('Resolver.md', '---\nkeys:\n  - resolver-test\n---\nBody');
      await app.workspace.getLeaf(false).openFile(file);
    },
    vaultPath
  });
  await pollInObsidian({
    async poll({ app }): Promise<string> {
      return await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`);
    },
    until: (value) => value.includes('resolver-test'),
    vaultPath
  });
  await evalInObsidian({
    async callback({ app, params }): Promise<void> {
      const file = app.vault.getFileByPath('Resolver.md');
      if (!file) {
        throw new Error('Missing fixture');
      }
      await app.vault.createFolder('Resolver folder');
      await app.vault.rename(file, 'Resolver folder/index.md');
      const other = await app.vault.create('Other resolver.md', 'Other');
      await app.workspace.getLeaf(false).openFile(other);
      const handler = app.workspace.protocolHandler.handlers.get('permanent-links');
      if (!handler) {
        throw new Error('Missing permanent-links handler');
      }
      handler(params);
    },
    input: { params: castTo<ObsidianProtocolData>({ action: 'permanent-links', key: 'resolver-test' }) },
    vaultPath
  });
  const opened = await pollInObsidian({
    poll({ app }): string {
      return app.workspace.getActiveFile()?.path ?? '';
    },
    until: (value) => value === 'Resolver folder/index.md',
    vaultPath
  });
  expect(opened).toBe('Resolver folder/index.md');
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const file = app.vault.getFileByPath('Resolver folder/index.md');
      if (!file) {
        throw new Error('Missing fixture');
      }
      await app.fileManager.trashFile(file);
    },
    vaultPath
  });
  const deleted = await pollInObsidian({
    async poll({ app }): Promise<string> {
      return await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`);
    },
    until: (value) => value.includes('deletedAt'),
    vaultPath
  });
  expect(deleted).toContain('Resolver folder/index.md');
  await evalInObsidian({
    callback({ app, params }): void {
      const handler = app.workspace.protocolHandler.handlers.get('permanent-links');
      if (!handler) {
        throw new Error('Missing permanent-links handler');
      }
      handler(params);
    },
    input: { params: castTo<ObsidianProtocolData>({ action: 'permanent-links', key: 'resolver-test' }) },
    vaultPath
  });
  const notice = await pollInObsidian({
    poll(): string {
      return document.querySelector('.notice-container')?.textContent ?? '';
    },
    until: (value) => value.includes('was deleted on'),
    vaultPath
  });
  expect(notice).toContain('Resolver folder/index.md');
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      await app.vault.create('Resolver folder/index.md', '---\nkeys:\n  - resolver-test\n---\nRestored');
    },
    vaultPath
  });
  const restored = await pollInObsidian({
    async poll({ app }): Promise<string> {
      return await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`);
    },
    until: (value) => !value.includes('deletedAt') && value.includes('resolver-test'),
    vaultPath
  });
  expect(restored).toContain('resolver-test');
});

it('opens a renamed attachment in its viewer through the registered handler', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      const file = await app.vault.create('Resolver image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
      await app.workspace.getLeaf(false).openFile(file);
      app.commands.executeCommandById('permanent-links:copy-permanent-link');
    },
    vaultPath
  });
  const key = await pollInObsidian({
    async poll({ app }): Promise<string> {
      const raw: unknown = JSON.parse(await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`));
      if (Array.isArray(raw)) {
        for (const entry of raw as unknown[]) {
          if (typeof entry === 'object' && entry !== null && 'path' in entry && entry.path === 'Resolver image.svg' && 'key' in entry && typeof entry.key === 'string') {
            return entry.key;
          }
        }
      }
      return '';
    },
    until: (value) => /^[a-z0-9]{12}$/u.test(value),
    vaultPath
  });
  expect(key).toMatch(/^[a-z0-9]{12}$/u);
  await evalInObsidian({
    async callback({ app, params }): Promise<void> {
      const file = app.vault.getFileByPath('Resolver image.svg');
      if (!file) {
        throw new Error('Missing attachment fixture');
      }
      await app.vault.rename(file, 'Renamed resolver image.svg');
      const note = await app.vault.create('Before attachment.md', 'Body');
      await app.workspace.getLeaf(false).openFile(note);
      const handler = app.workspace.protocolHandler.handlers.get('permanent-links');
      if (!handler) {
        throw new Error('Missing permanent-links handler');
      }
      handler(params);
    },
    input: { params: castTo<ObsidianProtocolData>({ action: 'permanent-links', key }) },
    vaultPath
  });
  const opened = await pollInObsidian({
    poll({ app }): string {
      return `${app.workspace.getActiveFile()?.path ?? ''}:${app.workspace.getMostRecentLeaf()?.view.getViewType() ?? ''}`;
    },
    until: (value) => value === 'Renamed resolver image.svg:image',
    vaultPath
  });
  expect(opened).toBe('Renamed resolver image.svg:image');
});
