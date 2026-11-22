import type { ObsidianProtocolData } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it,
  onTestFinished
} from 'vitest';

it('copies a permanent link to the block at the cursor, adding a block id, and opens it at the block', async () => {
  const vaultPath = getTemporaryVault().path;
  onTestFinished(async () => {
    await evalInObsidian({
      callback(): void {
        Reflect.deleteProperty(navigator.clipboard, 'writeText');
        delete document.body.dataset['permanentLinksCopiedText'];
      },
      vaultPath
    });
  });
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      // Record the copied text instead of reading the system clipboard, which rejects a window without focus.
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        // The closure is serialized into Obsidian, so it cannot import an async no-op helper.
        // eslint-disable-next-line @typescript-eslint/require-await -- Matches the async clipboard signature.
        value: async (text: string): Promise<void> => {
          document.body.dataset['permanentLinksCopiedText'] = text;
        }
      });
      const file = await app.vault.create('Block link.md', '# Title\n\nFirst paragraph\n\nTarget paragraph\n');
      await app.workspace.getLeaf(false).openFile(file);
      const editor = app.workspace.activeEditor?.editor;
      if (!editor) {
        throw new Error('No active editor');
      }
      editor.setCursor({ ch: 2, line: 4 });
      app.commands.executeCommandById('permanent-links:copy-permanent-link-to-heading-or-block');
    },
    vaultPath
  });
  const content = await pollInObsidian({
    async poll({ app }): Promise<string> {
      const file = app.vault.getFileByPath('Block link.md');
      return file ? await app.vault.read(file) : '';
    },
    until: (value) => /Target paragraph \^[a-z0-9]{6}\n/u.test(value) && /keys:\s*\n\s*- [a-z0-9]{12}/u.test(value),
    vaultPath
  });
  const blockId = ensureNonNullable(/Target paragraph \^(?<id>[a-z0-9]{6})/u.exec(content)?.groups?.['id']);
  const key = ensureNonNullable(/- (?<key>[a-z0-9]{12})/u.exec(content)?.groups?.['key']);
  expect(content).toContain('First paragraph\n');
  const link = await pollInObsidian({
    poll(): string {
      return document.body.dataset['permanentLinksCopiedText'] ?? '';
    },
    until: (value) => value.endsWith(`&key=${key}&block=${blockId}`),
    vaultPath
  });
  expect(link).toMatch(/^obsidian:\/\/permanent-links\?vault=.+&key=[a-z0-9]{12}&block=[a-z0-9]{6}$/u);
  await evalInObsidian({
    callback({ app, params }): void {
      app.workspace.activeEditor?.editor?.setCursor({ ch: 0, line: 0 });
      app.workspace.protocolHandler.handlers.get('permanent-links')?.(params);
    },
    input: { params: castTo<ObsidianProtocolData>({ action: 'permanent-links', ...Object.fromEntries(new URL(link).searchParams) }) },
    vaultPath
  });
  const cursorLine = await pollInObsidian({
    poll({ app }): number {
      return app.workspace.activeEditor?.file?.path === 'Block link.md' ? app.workspace.activeEditor.editor?.getCursor().line ?? -1 : -1;
    },
    until: (value) => value > 0 && value === content.split('\n').findIndex((line) => line.startsWith('Target paragraph')),
    vaultPath
  });
  expect(cursorLine).toBeGreaterThan(0);
});
