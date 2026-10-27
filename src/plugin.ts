import type { PluginApiDeclaration } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import type {
  ObsidianProtocolData,
  TFile
} from 'obsidian';

import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { CallbackLayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { checkIsPlainObject } from '@mnaoumov/obsidian-lib/frontmatter';
import { confirm } from '@mnaoumov/obsidian-lib/modals/confirm';
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { selectItem } from '@mnaoumov/obsidian-lib/modals/select-item';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { normalizePath } from 'obsidian';

import type { PermanentLinksApi } from '../api.d.ts';

import { KeyCommandHandler } from './keys/key-command-handler.ts';
import { resolveKeyEdit } from './keys/key-edit-modal.ts';
import { KeyService } from './keys/key-service.ts';
import { LinkResolver } from './keys/link-resolver.ts';
import { TombstoneCommandHandler } from './keys/tombstone-command-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

const JSON_INDENT = 2;

export class Plugin extends PluginBase {
  private keyService?: KeyService;
  private keysReady?: Promise<void>;

  protected override getPluginApis(): PluginApiDeclaration[] {
    const api: PermanentLinksApi = {
      addKey: (file, key) => this.getKeyService().addKey(file.path, key),
      assignKey: (file) => this.getKeyService().assignKey(file.path),
      getKeys: (file) => this.getKeyService().getKeys(file.path),
      moveKeys: (fromFile, toFile) => this.getKeyService().moveKeys(fromFile.path, toFile.path),
      resolve: (key) => {
        const entry = this.getKeyService().resolve(key);
        return entry ? this.app.vault.getFileByPath(entry.path) : null;
      }
    };
    return [{ api, apiVersion: '1.1.0' }];
  }

  protected override async onloadImpl(): Promise<void> {
    const settings = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = settings;
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({ plugin: this, pluginSettingsComponent: settings })
      })
    );
    this.addChild(
      new CallbackLayoutReadyComponent(this.app, () => {
        this.keysReady = this.initializeKeys(settings);
        return this.keysReady;
      })
    );
    this.registerObsidianProtocolHandler('permanent-links', (params) => {
      invokeAsyncSafely(() => this.openPermanentLink(params, settings));
    });
    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }

  private async copyLink(file: TFile): Promise<void> {
    const key = await this.getKeyService().assignKey(file.path);
    const link = `obsidian://permanent-links?vault=${encodeURIComponent(this.app.vault.getName())}&key=${encodeURIComponent(key)}`;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Uses the browser clipboard in Obsidian's renderer.
    await window.navigator.clipboard.writeText(link);
    this.pluginNoticeComponent.showNotice('Permanent link copied.');
  }

  private getKeyService(): KeyService {
    if (!this.keyService) {
      throw new Error('Permanent links are not ready. Wait for the vault to finish loading.');
    }
    return this.keyService;
  }

  private async initializeKeys(settings: PluginSettingsComponent): Promise<void> {
    const propertyName = settings.settings.keyPropertyName.trim();
    if (!propertyName) {
      throw new Error('Key property name must not be empty.');
    }
    const storePath = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/keys.json`);
    const service = new KeyService({
      fileExists: (path): boolean => this.app.vault.getFileByPath(path) !== null,
      getNotePaths: (): string[] => this.app.vault.getMarkdownFiles().map((file) => file.path),
      notice: (message): void => {
        this.pluginNoticeComponent.showNotice(message);
      },
      readNoteKeys: (path): unknown => this.app.metadataCache.getFileCache(this.requireFile(path))?.frontmatter?.[propertyName] as unknown,
      readNoteReceipt: (path): unknown => this.app.metadataCache.getFileCache(this.requireFile(path))?.frontmatter?.[`${propertyName}-accepted`] as unknown,
      readStore: async (): Promise<unknown> =>
        await this.app.vault.adapter.exists(storePath)
          ? JSON.parse(await this.app.vault.adapter.read(storePath)) as unknown
          : null,
      resolveKeyEdit: (path, previous, next): Promise<'keep' | 'redirect' | 'revert'> => resolveKeyEdit(this.app, path, previous, next),
      writeNoteKeys: async (path, keys): Promise<void> => {
        await this.app.fileManager.processFrontMatter(this.requireFile(path), (frontmatter) => {
          if (!checkIsPlainObject(frontmatter)) {
            throw new Error('Frontmatter must be an object.');
          }
          if (keys.length > 0) {
            Object.defineProperty(frontmatter, propertyName, { configurable: true, enumerable: true, value: [...keys], writable: true });
          } else {
            Reflect.deleteProperty(frontmatter, propertyName);
          }
          Object.defineProperty(frontmatter, `${propertyName}-accepted`, { configurable: true, enumerable: true, value: [...keys], writable: true });
        });
      },
      writeStore: (entries): Promise<void> => this.app.vault.adapter.write(storePath, JSON.stringify(entries, null, JSON_INDENT))
    });
    const loading = service.load();
    // Subscribe before the first read finishes, so startup indexing cannot fall between the snapshot and the listeners.
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      invokeAsyncSafely(async () => {
        await loading;
        await service.reconcile([file.path]);
      });
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      invokeAsyncSafely(async () => {
        await loading;
        await service.rename(oldPath, file.path);
      });
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      invokeAsyncSafely(async () => {
        await loading;
        await service.deletePath(file.path);
      });
    }));
    this.registerEvent(this.app.vault.on('create', (file) => {
      invokeAsyncSafely(async () => {
        await loading;
        await service.revivePath(file.path);
      });
    }));
    await loading;
    this.keyService = service;
    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new KeyCommandHandler({ execute: (file): Promise<void> => this.copyLink(file), icon: 'link', id: 'copy-permanent-link', name: 'Copy permanent link' }),
      new KeyCommandHandler({ execute: (file): Promise<void> => this.setKey(file), icon: 'key', id: 'set-key', name: 'Set key' }),
      new KeyCommandHandler({ execute: (file): Promise<void> => this.removeKey(file), icon: 'unlink', id: 'remove-key', name: 'Remove key' }),
      new TombstoneCommandHandler(() => this.manageTombstones())
    ]);
  }

  private async manageTombstones(): Promise<void> {
    const service = this.getKeyService();
    const entries = service.listTombstones();
    if (entries.length === 0) {
      this.pluginNoticeComponent.showNotice('There are no deleted permanent keys.');
      return;
    }
    const entry = await selectItem({
      app: this.app,
      items: entries,
      itemTextFunction: (value): string => `${value.key} — ${value.path} — ${value.deletedAt ?? ''}`,
      placeholder: 'Deleted keys: choose one to purge'
    });
    if (
      entry && await confirm({
        app: this.app,
        message: `Permanently forget “${entry.key}” at ${entry.path}? Old links will report an unknown key, and this key can be assigned again.`,
        okButtonText: 'Purge key',
        title: 'Purge deleted key'
      })
    ) {
      await service.purgeTombstones([entry.key]);
    }
  }

  private async openPermanentLink(params: ObsidianProtocolData, settings: PluginSettingsComponent): Promise<void> {
    if (!this.keysReady) {
      this.addChild(new CallbackLayoutReadyComponent(this.app, () => this.openPermanentLink(params, settings)));
      return;
    }
    await this.keysReady;
    const service = this.getKeyService();
    const resolver = new LinkResolver({
      fileExists: (path): boolean => this.app.vault.getFileByPath(path) !== null,
      getFilePaths: (): string[] => this.app.vault.getFiles().map((file) => file.path),
      getVaultName: (): string => this.app.vault.getName(),
      lookup: (key): ReturnType<KeyService['lookup']> => service.lookup(key),
      missing: (path): Promise<void> => this.resolveMissingPath(path),
      notice: (message): void => {
        this.pluginNoticeComponent.showNotice(message);
      },
      open: async (path, query): Promise<void> => {
        await service.revivePath(path);
        const subpath = query['block'] ? `#^${query['block']}` : (query['heading'] ? `#${query['heading']}` : '');
        await this.app.workspace.openLinkText(path + subpath, '', query['openmode'] === 'tab');
      },
      shouldUseFileName: (): boolean => settings.settings.shouldResolveUniqueFileNames
    });
    await resolver.resolve(params);
  }

  private async removeKey(file: TFile): Promise<void> {
    const service = this.getKeyService();
    const keys = service.getKeys(file.path);
    if (keys.length === 0) {
      this.pluginNoticeComponent.showNotice('This file has no permanent keys.');
      return;
    }
    const key = keys.length === 1 ? ensureNonNullable(keys[0]) : await selectItem({
      app: this.app,
      items: keys,
      itemTextFunction: (value): string => value,
      placeholder: 'Choose a key to remove'
    });
    if (key === null) {
      return;
    }
    const isConfirmed = await confirm({
      app: this.app,
      message: `Remove “${key}” from ${file.path}? Every external link using this key will stop working.`,
      okButtonText: 'Remove key',
      title: 'Remove key'
    });
    if (isConfirmed) {
      await service.removeKey(file.path, key);
    }
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      throw new Error(`File no longer exists: ${path}`);
    }
    return file;
  }

  private async resolveMissingPath(path: string): Promise<void> {
    const parts = path.split('/');
    parts.pop();
    let missingFolder = '';
    for (const part of parts) {
      const candidate = missingFolder ? `${missingFolder}/${part}` : part;
      if (!this.app.vault.getFolderByPath(candidate)) {
        missingFolder = candidate;
        break;
      }
      missingFolder = candidate;
    }
    const hasMissingFolder = missingFolder !== '' && !this.app.vault.getFolderByPath(missingFolder);
    const fileChoice = `I removed file ${path}`;
    const folderChoice = `I removed folder ${missingFolder}`;
    const choice = await selectItem({
      app: this.app,
      items: hasMissingFolder ? ['I don\'t know', folderChoice, fileChoice] : ['I don\'t know', fileChoice],
      itemTextFunction: (value): string => value,
      placeholder: `File not found. Last known location: ${path}${hasMissingFolder ? `. Folder ${missingFolder} is also missing.` : ''}`
    });
    if (!(choice === fileChoice || choice === folderChoice)) {
      return;
    }

    await this.getKeyService().deletePath(choice === folderChoice ? missingFolder : path);
    this.pluginNoticeComponent.showNotice('The deleted location has been recorded.');
  }

  private async setKey(file: TFile): Promise<void> {
    const service = this.getKeyService();
    const key = await prompt({
      app: this.app,
      placeholder: 'Letters, numbers, hyphens or underscores',
      title: 'Set key',
      valueValidator: (value): string => {
        try {
          service.validateKey(file.path, value);
          return '';
        } catch (error) {
          return String(error);
        }
      }
    });
    if (key !== null) {
      await service.addKey(file.path, key);
    }
  }
}
// Cspell:words openmode
