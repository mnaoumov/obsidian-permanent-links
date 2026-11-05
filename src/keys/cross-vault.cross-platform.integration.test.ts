import type { EventEmitter } from 'node:events';
import type { ObsidianProtocolData } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  evalInObsidian,
  pollInObsidian,
  registerVault,
  TemporaryVault
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it,
  vi
} from 'vitest';

it.each(['native URI', 'trusted folder move'])('opens a second registered vault using %s', async (scenario) => {
  const source = getTemporaryVault().path;
  const isMobile = await evalInObsidian({
    callback({ app }): boolean {
      return app.isMobile;
    },
    vaultPath: source
  });
  const configDirectory = await evalInObsidian({
    callback({ app }): string {
      return app.vault.configDir;
    },
    vaultPath: source
  });
  await using target = new TemporaryVault();
  target.populate({
    [`${configDirectory}/community-plugins.json`]: JSON.stringify(['permanent-links']),
    [`${configDirectory}/plugins/permanent-links/main.js`]: readFileSync('dist/build/main.js'),
    [`${configDirectory}/plugins/permanent-links/manifest.json`]: readFileSync('dist/build/manifest.json'),
    'Target.md': '---\nkeys:\n  - cross-vault-probe\n---\nTarget'
  });
  await target.syncToDevice();
  try {
    const isPrepared = await evalInObsidian({
      callback({ app, targetName, targetPath }): boolean {
        if (app.isMobile) {
          const current = window.localStorage.getItem('mobile-selected-vault') ?? '';
          const path = `${current.slice(0, current.lastIndexOf('/') + 1)}${targetName}`;
          const raw: unknown = JSON.parse(window.localStorage.getItem('mobile-external-vaults') ?? '[]');
          if (!Array.isArray(raw) || !raw.every((value): value is string => typeof value === 'string')) {
            throw new TypeError('Invalid mobile vault registry');
          }
          window.localStorage.setItem('mobile-external-vaults', JSON.stringify([...raw, path]));
          window.localStorage.setItem(`enable-plugin-${path}`, 'true');
          return true;
        }
        return window.electron.ipcRenderer.sendSync('vault-open', targetPath, false) === true;
      },
      input: { targetName: basename(target.path), targetPath: target.path },
      vaultPath: source
    });
    expect(isPrepared).toBe(true);
    if (!isMobile) {
      await vi.waitFor(async () => {
        const isReady = await evalInObsidian({
          async callback({ app }): Promise<boolean> {
            const trust = [...document.querySelectorAll<HTMLButtonElement>('.modal button')].find((button) => button.textContent === 'Trust author and enable plugins');
            trust?.click();
            if (!app.plugins.isEnabled()) {
              await app.plugins.setEnable(true);
            }
            if (!Object.hasOwn(app.plugins.plugins, 'permanent-links')) {
              await app.plugins.enablePluginAndSave('permanent-links');
            }
            const store = `${app.vault.configDir}/plugins/permanent-links/keys.json`;
            return app.workspace.layoutReady && app.workspace.protocolHandler.handlers.has('permanent-links') && await app.vault.adapter.exists(store);
          },
          vaultPath: target.path
        });
        expect(isReady).toBe(true);
      }, { timeout: 30_000 });
    }
    if (scenario === 'native URI') {
      await evalInObsidian({
        callback({ app, url }): void {
          if (app.isMobile) {
            app.workspace.protocolHandler.execCapacitorUrl(url);
          } else {
            // Keep native URI dispatch inside the harness-owned Electron process.
            const emitter: unknown = window.electron.remote.app;
            function checkEmitter(value: unknown): value is EventEmitter {
              return typeof value === 'object' && value !== null && 'emit' in value && typeof value.emit === 'function';
            }
            if (!checkEmitter(emitter)) {
              throw new Error('Missing native URI emitter');
            }
            emitter.emit('open-url', { preventDefault: (): undefined => undefined }, url);
          }
        },
        input: { url: `obsidian://permanent-links?vault=${encodeURIComponent(basename(target.path))}&key=cross-vault-probe` },
        vaultPath: source
      });
    } else {
      await evalInObsidian({
        async callback({ app }): Promise<void> {
          await app.vault.createFolder('Outgoing');
          await app.vault.create('Outgoing/Source.md', '---\nkeys:\n  - cross-vault-probe\n  - cross-vault-alias\n---\nSource');
          await app.vault.create('Outgoing/Other.md', '---\nkeys:\n  - cross-vault-other\n---\nOther');
        },
        vaultPath: source
      });
      await pollInObsidian({
        async poll({ app }): Promise<string> {
          return await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`);
        },
        until: (value) => value.includes('cross-vault-other') && value.includes('cross-vault-alias'),
        vaultPath: source
      });
      await evalInObsidian({
        async callback({ app }): Promise<void> {
          const folder = app.vault.getFolderByPath('Outgoing');
          if (!folder) {
            throw new Error('Missing source fixture');
          }
          await app.fileManager.trashFile(folder);
        },
        vaultPath: source
      });
      await pollInObsidian({
        async poll({ app }): Promise<string> {
          return await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`);
        },
        until: (value) => value.includes('deletedAt'),
        vaultPath: source
      });
      await evalInObsidian({
        callback({ app, params }): void {
          app.workspace.protocolHandler.handlers.get('permanent-links')?.(params);
        },
        input: { params: castTo<ObsidianProtocolData>({ action: 'permanent-links', key: 'cross-vault-probe' }) },
        vaultPath: source
      });
      await pollInObsidian({
        poll(): boolean {
          const button = [...document.querySelectorAll<HTMLButtonElement>('.notice button')].find((value) => value.textContent === 'Correct location');
          button?.click();
          return Boolean(button);
        },
        until: (value) => value,
        vaultPath: source
      });
      await pollInObsidian({
        poll(): boolean {
          const item = [...document.querySelectorAll<HTMLElement>('.suggestion-item')].find((value) => value.textContent.includes('I moved folder Outgoing'));
          item?.click();
          return Boolean(item);
        },
        until: (value) => value,
        vaultPath: source
      });
      await pollInObsidian({
        input: { targetName: basename(target.path) },
        poll({ targetName }): boolean {
          const item = [...document.querySelectorAll<HTMLElement>('.suggestion-item')].find((value) => value.textContent.includes(targetName));
          item?.click();
          return Boolean(item);
        },
        until: (value) => value,
        vaultPath: source
      });
    }
    const opened = await vi.waitFor(async () => {
      const value = await evalInObsidian({
        callback({ app }): string {
          const trust = [...document.querySelectorAll<HTMLButtonElement>('.modal button')].find((button) => button.textContent === 'Trust author and enable plugins');
          trust?.click();
          return `${app.vault.getName()}:${app.workspace.getActiveFile()?.path ?? ''}`;
        },
        vaultPath: target.path
      });
      expect(value).toBe(`${basename(target.path)}:Target.md`);
      return value;
    }, { timeout: 30_000 });
    expect(opened).toBe(`${basename(target.path)}:Target.md`);
    if (scenario === 'trusted folder move') {
      await registerVault(source);
      const entries = await evalInObsidian({
        async callback({ app }): Promise<unknown> {
          return JSON.parse(await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`)) as unknown;
        },
        vaultPath: source
      });
      expect(entries).toEqual(expect.arrayContaining([
        { forwardVault: basename(target.path), key: 'cross-vault-probe', path: 'Outgoing/Source.md' },
        { forwardVault: basename(target.path), key: 'cross-vault-alias', path: 'Outgoing/Source.md' },
        { forwardVault: basename(target.path), key: 'cross-vault-other', path: 'Outgoing/Other.md' }
      ]));
    }
  } catch (error) {
    console.error(
      await evalInObsidian({
        async callback({ app }): Promise<string> {
          const path = `${app.vault.configDir}/plugins/permanent-links/keys.json`;
          return JSON.stringify({ active: app.workspace.getActiveFile()?.path, modal: document.querySelector('.modal')?.textContent, name: app.vault.getName(), notices: document.querySelector('.notice-container')?.textContent, plugins: Object.keys(app.plugins.plugins), store: await app.vault.adapter.exists(path) ? await app.vault.adapter.read(path) : 'absent' });
        },
        vaultPath: target.path
      })
    );
    throw error;
  } finally {
    if (isMobile) {
      await registerVault(source);
    } else {
      // Close the target window from the source window's main process. An eval inside the closing window races the
      // CDP reply against the page teardown, so it can hang until the per-eval cap.
      await evalInObsidian({
        callback(): void {
          const currentWindowId = window.electron.remote.getCurrentWindow().id;
          for (const browserWindow of window.electron.remote.BrowserWindow.getAllWindows()) {
            if (browserWindow.id !== currentWindowId) {
              browserWindow.close();
            }
          }
        },
        vaultPath: source
      });
      await vi.waitFor(async () => {
        const count = await evalInObsidian({
          callback(): number {
            return window.electron.remote.BrowserWindow.getAllWindows().length;
          },
          vaultPath: source
        });
        expect(count).toBe(1);
      });
    }
  }
}, 120_000);
