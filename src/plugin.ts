import type { PluginApiDeclaration } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import type { TFile } from 'obsidian';

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
import { KeyService } from './keys/key-service.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

const JSON_INDENT = 2;

export class Plugin extends PluginBase {
  private keyService?: KeyService;

  protected override getPluginApis(): PluginApiDeclaration[] {
    const api: PermanentLinksApi = {
      addKey: (file, key) => this.getKeyService().addKey(file.path, key),
      assignKey: (file) => this.getKeyService().assignKey(file.path),
      getKeys: (file) => this.getKeyService().getKeys(file.path),
      resolve: (key) => {
        const entry = this.getKeyService().resolve(key);
        return entry ? this.app.vault.getFileByPath(entry.path) : null;
      }
    };
    return [{ api, apiVersion: '1.0.0' }];
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
    this.addChild(new CallbackLayoutReadyComponent(this.app, () => this.initializeKeys(settings)));
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
      readNoteKeys: (path): unknown => this.app.metadataCache.getFileCache(this.requireFile(path))?.frontmatter?.[propertyName] as unknown,
      readStore: async (): Promise<unknown> =>
        await this.app.vault.adapter.exists(storePath)
          ? JSON.parse(await this.app.vault.adapter.read(storePath)) as unknown
          : null,
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
    await loading;
    this.keyService = service;
    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new KeyCommandHandler({ execute: (file): Promise<void> => this.copyLink(file), icon: 'link', id: 'copy-permanent-link', name: 'Copy permanent link' }),
      new KeyCommandHandler({ execute: (file): Promise<void> => this.setKey(file), icon: 'key', id: 'set-key', name: 'Set key' }),
      new KeyCommandHandler({ execute: (file): Promise<void> => this.removeKey(file), icon: 'unlink', id: 'remove-key', name: 'Remove key' })
    ]);
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
