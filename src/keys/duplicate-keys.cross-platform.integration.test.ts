import {
  evalInObsidian,
  pollInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

it('repairs a copied frontmatter key without changing either body or unrelated properties', async () => {
  const vaultPath = getTemporaryVault().path;
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      await app.vault.create('Original identity.md', '---\nkeys: [original-identity]\n---\nOriginal body');
    },
    vaultPath
  });
  await pollInObsidian({
    poll({ app }): boolean {
      const file = app.vault.getFileByPath('Original identity.md');
      return Boolean(file && app.metadataCache.getFileCache(file)?.frontmatter?.['keys-accepted']);
    },
    until: Boolean,
    vaultPath
  });
  await evalInObsidian({
    async callback({ app }): Promise<void> {
      await app.vault.create('Copied identity.md', '---\nkeys: [ORIGINAL-IDENTITY, own-alias]\nother: preserved\n---\nCopied body');
    },
    vaultPath
  });
  const content = await pollInObsidian({
    async poll({ app }): Promise<string> {
      const file = app.vault.getFileByPath('Copied identity.md');
      return file ? await app.vault.read(file) : '';
    },
    until: (value) => value.includes('own-alias') && !value.includes('ORIGINAL-IDENTITY'),
    vaultPath
  });
  expect(content).toContain('Copied body');
  expect(content).toContain('other: preserved');
});
