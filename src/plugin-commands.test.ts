import type { PluginApiDeclaration } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import type {
  PluginManifest,
  TFile
} from 'obsidian';

import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import { confirm } from '@mnaoumov/obsidian-lib/modals/confirm';
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { selectItem } from '@mnaoumov/obsidian-lib/modals/select-item';
import { SettingEx } from '@mnaoumov/obsidian-lib/setting-ex';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  App,
  MarkdownView,
  Menu,
  MenuItem
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PermanentLinksApi } from '../api.d.ts';
import type { KeyService } from './keys/key-service.ts';

import { resolveKeyEdit } from './keys/key-edit-modal.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { Plugin } from './plugin.ts';

vi.mock('@mnaoumov/obsidian-lib/modals/prompt', () => ({ prompt: vi.fn() }));
vi.mock('@mnaoumov/obsidian-lib/modals/confirm', () => ({ confirm: vi.fn() }));
vi.mock('@mnaoumov/obsidian-lib/modals/select-item', () => ({ selectItem: vi.fn() }));
vi.mock('./keys/key-edit-modal.ts', () => ({ resolveKeyEdit: vi.fn() }));

// Export spies need the module object rather than individual function bindings.
const vaultNavigation = await import('./keys/vault-navigation.ts');

interface PluginInternals {
  readonly copyLink: (file: TFile, settings: PluginSettingsComponent) => Promise<void>;
  readonly copyLinks: (files: TFile[], settings: PluginSettingsComponent) => Promise<void>;
  readonly getKeyService: () => KeyService;
  readonly getPluginApis: () => PluginApiDeclaration<PermanentLinksApi>[];
  readonly initializeKeys: (settings: PluginSettingsComponent) => Promise<void>;
  readonly manageTombstones: () => Promise<void>;
  readonly openPermanentLink: (params: Partial<import('obsidian').ObsidianProtocolData>, settings: PluginSettingsComponent) => Promise<void>;
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly removeKey: (file: TFile) => Promise<void>;
  readonly requireFile: (path: string) => TFile;
  readonly resolveMissingPath: (path: string, query?: Partial<import('obsidian').ObsidianProtocolData>) => Promise<void>;
  readonly setKey: (file: TFile) => Promise<void>;
}

const MANIFEST: PluginManifest = { author: 'test', description: 'test', id: 'permanent-links', minAppVersion: '1.14.4', name: 'Permanent Links', version: '0.0.0' };
const STORE_SUFFIX = '/plugins/permanent-links/keys.json';

async function createFixture(): Promise<PluginFixture> {
  const mockApp = App.createConfigured__();
  const app = mockApp.asOriginalType__();
  app.internalPlugins = castTo<typeof app.internalPlugins>({ getPluginById: () => null });
  const file = await app.vault.create('note.md', 'Body\n');
  await app.vault.adapter.mkdir(`${app.vault.configDir}/plugins`);
  await app.vault.adapter.mkdir(`${app.vault.configDir}/plugins/permanent-links`);
  const plugin = new Plugin(app, MANIFEST);
  const internals = castTo<PluginInternals>(plugin);
  const commands = vi.spyOn(plugin, 'addCommand');
  mockApp.workspace.setLayoutReady__();
  await plugin.onload();
  await vi.waitFor(() => {
    expect(commands.mock.calls.some(([command]) => command.id === 'copy-permanent-link')).toBe(true);
  });
  const api = ensureNonNullable(internals.getPluginApis()[0]).api;
  return { api, app, commands, file, internals, mockApp, plugin };
}

function flattenMenuItems(menu: Menu): MenuItem[] {
  return menu.menuItems__.flatMap((item) => [item, ...(item.submenu ? flattenMenuItems(item.submenu) : [])]);
}

describe('plugin key commands', () => {
  it('trusts a moved-folder answer, forwards the triggering link and reuses persisted forwarding', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    await app.vault.createFolder('gone');
    const first = await app.vault.create('gone/first.md', 'Body');
    const second = await app.vault.create('gone/second.pdf', 'Data');
    await api.addKey(first, 'first');
    await api.addKey(first, 'alias');
    await api.addKey(second, 'second');
    await api.addKey(file, 'live');
    const folder = ensureNonNullable(app.vault.getFolderByPath('gone'));
    await app.fileManager.trashFile(folder);
    await vi.waitFor(() => {
      expect(internals.getKeyService().listTombstones()).toHaveLength(3);
    });
    vi.spyOn(vaultNavigation, 'listVaults').mockReturnValue([{ name: 'Other', path: '/Other' }, { name: app.vault.getName(), path: '/Current' }]);
    const open = vi.spyOn(vaultNavigation, 'openVaultUri').mockImplementation(() => undefined);
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    vi.mocked(selectItem).mockResolvedValueOnce('I moved folder gone to another vault').mockResolvedValueOnce({ name: 'Other', path: '/Other' });
    await internals.resolveMissingPath('gone/first.md', { heading: 'Title', key: 'first' });
    expect(internals.getKeyService().lookup('alias')?.forwardVault).toBe('Other');
    expect(internals.getKeyService().lookup('second')?.forwardVault).toBe('Other');
    expect(api.resolve('live')).toBe(file);
    expect(open).toHaveBeenCalledWith(app, expect.stringContaining('heading=Title'));
    const destinationPicker = ensureNonNullable(vi.mocked(selectItem).mock.calls.at(-1)?.[0]);
    expect(destinationPicker.itemTextFunction({ name: 'Other', path: '/Other' })).toContain('/Other');
    expect(destinationPicker.itemTextFunction({ name: 'Choose', path: '' })).toBe('Choose');
    expect(destinationPicker.items).not.toContainEqual({ name: app.vault.getName(), path: '/Current' });
    await internals.openPermanentLink({ key: 'first' }, internals.pluginSettingsComponent);
    expect(open).toHaveBeenCalledTimes(2);
    expect(notice).toHaveBeenCalledWith(expect.any(DocumentFragment), { isPermanent: true });
    plugin.unload();
  });

  it('supports vault and folder cancellation, folder selection and unavailable navigation', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    await api.addKey(file, 'note');
    await app.fileManager.trashFile(file);
    await vi.waitFor(() => {
      expect(internals.getKeyService().listTombstones()).toHaveLength(1);
    });
    const list = vi.spyOn(vaultNavigation, 'listVaults').mockReturnValue([]);
    const pick = vi.spyOn(vaultNavigation, 'pickVaultFolder').mockResolvedValue(null);
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    const choice = 'I moved file note.md to another vault';
    vi.mocked(selectItem).mockResolvedValueOnce(choice).mockResolvedValueOnce(null);
    await internals.resolveMissingPath('note.md');
    expect(pick).not.toHaveBeenCalled();
    vi.mocked(selectItem).mockResolvedValueOnce(choice).mockResolvedValueOnce({ name: 'Choose', path: '' });
    await internals.resolveMissingPath('note.md');
    expect(pick).toHaveBeenCalledTimes(1);
    pick.mockResolvedValue({ name: 'Chosen', path: '/Chosen' });
    vi.mocked(selectItem).mockResolvedValueOnce(choice).mockResolvedValueOnce({ name: 'Choose', path: '' });
    await internals.resolveMissingPath('note.md');
    expect(internals.getKeyService().lookup('note')?.forwardVault).toBe('Chosen');
    pick.mockResolvedValue({ name: app.vault.getName(), path: '/Current' });
    vi.mocked(selectItem).mockResolvedValueOnce(choice).mockResolvedValueOnce({ name: 'Choose', path: '' });
    await internals.resolveMissingPath('note.md');
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('Choose a different'));
    list.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    vi.mocked(selectItem).mockResolvedValueOnce(choice);
    await internals.resolveMissingPath('note.md');
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('Could not select'));
    plugin.unload();
  });

  it('offers correction on a tombstone notice and copies the replacement URI from forwarding notices', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    await api.addKey(file, 'note');
    await app.fileManager.trashFile(file);
    await vi.waitFor(() => {
      expect(internals.getKeyService().listTombstones()).toHaveLength(1);
    });
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice').mockImplementation(() => castTo<ReturnType<PluginNoticeComponent['showNotice']>>({}));
    await internals.openPermanentLink({ key: 'note' }, internals.pluginSettingsComponent);
    const correction = notice.mock.lastCall?.[0];
    expect(correction).toBeInstanceOf(DocumentFragment);
    vi.mocked(selectItem).mockResolvedValueOnce(null);
    if (correction instanceof DocumentFragment) {
      correction.querySelector('button')?.click();
    }
    await vi.waitFor(() => {
      expect(selectItem).toHaveBeenCalled();
    });
    await internals.getKeyService().forwardPath('note.md', 'Unregistered');
    vi.spyOn(vaultNavigation, 'listVaults').mockReturnValue([]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await internals.openPermanentLink({ key: 'note' }, internals.pluginSettingsComponent);
    const forwarding = notice.mock.lastCall?.[0];
    expect(forwarding).toBeInstanceOf(DocumentFragment);
    if (forwarding instanceof DocumentFragment) {
      forwarding.querySelector('button')?.click();
    }
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('vault=Unregistered'));
    });
    expect(notice).toHaveBeenCalledWith('New permanent link copied.');
    plugin.unload();
  });

  it('publishes the merge API and preserves transferred keys through metadata events', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    const target = await app.vault.create('target.md', 'Target body');
    await api.addKey(file, 'source');
    await api.addKey(target, 'primary');
    await api.moveKeys(file, target);
    await internals.getKeyService().reconcile();
    expect(api.getKeys(file)).toEqual([]);
    expect(api.getKeys(target)).toEqual(['primary', 'source']);
    expect(api.resolve('source')).toBe(target);
    expect(ensureNonNullable(internals.getPluginApis()[0]).apiVersion).toBe('1.1.0');
    plugin.unload();
  });

  afterEach(() => vi.restoreAllMocks());

  it('wires duplicate notices, edit decisions and atomic acceptance receipts', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    await api.addKey(file, 'A');
    await app.vault.create('copy.md', '---\nkeys: [A, own]\n---\nCopy body');
    await vi.waitFor(() => {
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('copy.md'));
    });
    vi.mocked(resolveKeyEdit).mockResolvedValueOnce('redirect');
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      Object.defineProperty(frontmatter, 'keys', { configurable: true, enumerable: true, value: ['B'], writable: true });
    });
    await vi.waitFor(() => {
      expect(api.getKeys(file)).toEqual(['B', 'A']);
    });
    expect(resolveKeyEdit).toHaveBeenCalledWith(app, 'note.md', ['A'], ['B']);
    await internals.getKeyService().reconcile(['note.md']);
    expect(resolveKeyEdit).toHaveBeenCalledTimes(1);
    plugin.unload();
  });

  it('registers a resolver and opens notes and attachments using their current paths', async () => {
    const registration = vi.spyOn(Plugin.prototype, 'registerObsidianProtocolHandler');
    const { api, app, file, internals, plugin } = await createFixture();
    const open = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue(undefined);
    vi.spyOn(app.vault, 'getName').mockReturnValue('Vault');
    await api.addKey(file, 'note');
    const handler = ensureNonNullable(registration.mock.calls.find(([action]) => action === 'permanent-links')?.[1]);
    handler(castTo<import('obsidian').ObsidianProtocolData>({ action: 'permanent-links', key: 'note' }));
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith('note.md', '', false);
    });
    await internals.openPermanentLink({ heading: 'Title', key: 'note', openmode: 'tab' }, internals.pluginSettingsComponent);
    expect(open).toHaveBeenLastCalledWith('note.md#Title', '', true);
    await internals.openPermanentLink({ block: 'block', key: 'note' }, internals.pluginSettingsComponent);
    expect(open).toHaveBeenLastCalledWith('note.md#^block', '', false);
    const attachment = await app.vault.create('image.png', 'data');
    await api.addKey(attachment, 'image');
    await internals.openPermanentLink({ key: 'image' }, internals.pluginSettingsComponent);
    expect(open).toHaveBeenLastCalledWith('image.png', '', false);
    expect(internals.pluginSettingsComponent.settings.shouldResolveUniqueFileNames).toBe(false);
    await internals.openPermanentLink({ key: 'unknown' }, internals.pluginSettingsComponent);
    await internals.pluginSettingsComponent.editAndSave((settings) => {
      settings.shouldResolveUniqueFileNames = true;
    });
    await internals.openPermanentLink({ key: 'unknown', vault: app.vault.getName() }, internals.pluginSettingsComponent);
    expect(open).toHaveBeenLastCalledWith('image.png', '', false);
    await internals.openPermanentLink({ key: 'image' }, internals.pluginSettingsComponent);
    expect(open).toHaveBeenLastCalledWith('image.png', '', false);
    const getFile = app.vault.getFileByPath.bind(app.vault);
    vi.spyOn(app.vault, 'getFileByPath').mockImplementation((path) => path === 'image.png' ? null : getFile(path));
    vi.mocked(selectItem).mockResolvedValueOnce(null);
    await internals.openPermanentLink({ key: 'image' }, internals.pluginSettingsComponent);
    expect(vi.mocked(selectItem).mock.lastCall?.[0].placeholder).toContain('image.png');
    plugin.unload();
  });

  it('queues links received before layout readiness', async () => {
    const mockApp = App.createConfigured__();
    const app = mockApp.asOriginalType__();
    app.internalPlugins = castTo<typeof app.internalPlugins>({ getPluginById: () => null });
    await app.vault.adapter.mkdir(`${app.vault.configDir}/plugins`);
    await app.vault.adapter.mkdir(`${app.vault.configDir}/plugins/permanent-links`);
    const plugin = new Plugin(app, MANIFEST);
    const internals = castTo<PluginInternals>(plugin);
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    await plugin.onload();
    await internals.openPermanentLink({ key: 'note' }, internals.pluginSettingsComponent);
    expect(notice).not.toHaveBeenCalled();
    mockApp.workspace.setLayoutReady__();
    await vi.waitFor(() => {
      expect(notice).toHaveBeenCalledWith('Unknown permanent key: note');
    });
    plugin.unload();
  });

  it('lists deleted keys, supports cancellation and confirmation, and runs the purge command', async () => {
    const { api, app, commands, file, internals, plugin } = await createFixture();
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    await internals.manageTombstones();
    expect(notice).toHaveBeenCalledWith('There are no deleted permanent keys.');
    await api.addKey(file, 'note');
    await app.fileManager.trashFile(file);
    await vi.waitFor(() => {
      expect(internals.getKeyService().listTombstones()).toHaveLength(1);
    });
    const entry = ensureNonNullable(internals.getKeyService().lookup('note'));
    vi.mocked(selectItem).mockResolvedValueOnce(null);
    await internals.manageTombstones();
    expect(internals.getKeyService().lookup('note')).toEqual(entry);
    const selection = ensureNonNullable(vi.mocked(selectItem).mock.lastCall?.[0]);
    expect(selection.itemTextFunction(entry)).toContain('note.md');
    expect(selection.itemTextFunction({ key: 'key', path: 'path' })).toContain('path');
    vi.mocked(selectItem).mockResolvedValueOnce(entry);
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await internals.manageTombstones();
    expect(internals.getKeyService().lookup('note')).toEqual(entry);
    vi.mocked(selectItem).mockResolvedValueOnce(entry);
    vi.mocked(confirm).mockResolvedValueOnce(true);
    const command = ensureNonNullable(commands.mock.calls.find(([value]) => value.id === 'manage-deleted-keys')?.[0]);
    command.checkCallback?.(false);
    await vi.waitFor(() => {
      expect(internals.getKeyService().lookup('note')).toBeNull();
    });
    plugin.unload();
  });

  it('revives restored files and records a confirmed missing folder without changing other entries', async () => {
    const { api, app, internals, plugin } = await createFixture();
    const attachment = await app.vault.create('restore.pdf', 'data');
    await api.addKey(attachment, 'restore');
    await app.fileManager.trashFile(attachment);
    await vi.waitFor(() => {
      expect(internals.getKeyService().listTombstones()).toHaveLength(1);
    });
    const restored = await app.vault.create('restore.pdf', 'data');
    await vi.waitFor(() => {
      expect(api.resolve('restore')).toBe(restored);
    });
    await app.vault.createFolder('exists');
    vi.mocked(selectItem).mockResolvedValueOnce(null).mockResolvedValueOnce('I don\'t know');
    await internals.resolveMissingPath('exists/gone.pdf');
    await internals.resolveMissingPath('root.pdf');
    expect(api.resolve('restore')).toBe(restored);
    vi.mocked(selectItem).mockResolvedValueOnce('I removed folder exists/missing');
    await internals.resolveMissingPath('exists/missing/deeper/gone.pdf');
    const selection = ensureNonNullable(vi.mocked(selectItem).mock.lastCall?.[0]);
    expect(selection.items).toContain('I removed folder exists/missing');
    expect(selection.itemTextFunction('choice')).toBe('choice');
    vi.mocked(selectItem).mockResolvedValueOnce('I removed file exists/gone.pdf');
    await internals.resolveMissingPath('exists/gone.pdf');
    expect(api.resolve('restore')).toBe(restored);
    plugin.unload();
  });

  it('registers file commands, stores note keys and publishes the read/assign API', async () => {
    const { api, app, commands, file, internals, plugin } = await createFixture();
    expect(commands.mock.calls.map(([command]) => command.id)).toEqual(expect.arrayContaining(['copy-permanent-link', 'set-key', 'remove-key', 'report-bug']));
    expect(api.resolve('unknown')).toBeNull();
    await api.addKey(file, 'Readable');
    expect(api.getKeys(file)).toEqual(['Readable']);
    expect(api.resolve('READABLE')).toBe(file);
    expect(await api.assignKey(file)).toBe('Readable');
    expect(await app.vault.read(file)).toContain('- Readable');
    expect(JSON.parse(await app.vault.adapter.read(app.vault.configDir + STORE_SUFFIX))).toEqual([{ key: 'Readable', path: 'note.md' }]);
    expect(() => internals.requireFile('gone.md')).toThrow('no longer exists');
    plugin.unload();
  });

  it('copies an encoded URI, reuses the first key and honours the redirector base URL', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await api.addKey(file, '文字');
    await internals.copyLink(file, internals.pluginSettingsComponent);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('&key=%E6%96%87%E5%AD%97'));
    expect(api.getKeys(file)).toEqual(['文字']);
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    await internals.pluginSettingsComponent.editAndSave((settings) => {
      settings.redirectorBaseUrl = 'https://links.example.com/open';
    });
    await internals.copyLink(file, internals.pluginSettingsComponent);
    expect(writeText).toHaveBeenLastCalledWith(`https://links.example.com/open?vault=${encodeURIComponent(app.vault.getName())}&key=%E6%96%87%E5%AD%97`);
    expect(notice).toHaveBeenLastCalledWith('Permanent link copied.');
    await internals.pluginSettingsComponent.editAndSave((settings) => {
      settings.redirectorBaseUrl = 'links.example.com';
    });
    await internals.copyLink(file, internals.pluginSettingsComponent);
    expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^obsidian:\/\/permanent-links\?/u));
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('redirector base URL'));
    plugin.unload();
  });

  it('validates a typed key, handles cancellation and adds an alias', async () => {
    const { api, file, internals, plugin } = await createFixture();
    vi.mocked(prompt).mockResolvedValueOnce(null).mockResolvedValueOnce('Readable');
    await internals.setKey(file);
    expect(api.getKeys(file)).toEqual([]);
    const validator = ensureNonNullable(vi.mocked(prompt).mock.calls[0]?.[0].valueValidator);
    expect(validator('bad key')).toContain('A key must contain');
    expect(validator('valid')).toBe('');
    await internals.setKey(file);
    expect(api.getKeys(file)).toEqual(['Readable']);
    plugin.unload();
  });

  it('requires confirmation, selects among aliases, and allows cancellation', async () => {
    const { api, file, internals, plugin } = await createFixture();
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    await internals.removeKey(file);
    expect(notice).toHaveBeenCalledWith('This file has no permanent keys.');
    await api.addKey(file, 'first');
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await internals.removeKey(file);
    expect(api.getKeys(file)).toEqual(['first']);
    await internals.removeKey(file);
    expect(api.getKeys(file)).toEqual([]);
    expect(await appRead(file, plugin)).not.toContain('first');
    await api.addKey(file, 'one');
    await api.addKey(file, 'two');
    vi.mocked(selectItem).mockResolvedValueOnce(null).mockResolvedValueOnce('two');
    await internals.removeKey(file);
    expect(api.getKeys(file)).toEqual(['one', 'two']);
    vi.mocked(confirm).mockResolvedValueOnce(true);
    await internals.removeKey(file);
    expect(api.getKeys(file)).toEqual(['one']);
    const selection = ensureNonNullable(vi.mocked(selectItem).mock.calls[0]?.[0]);
    expect(selection.itemTextFunction('one')).toBe('one');
    plugin.unload();
  });

  it('reloads the separate store and tracks attachment renames', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    const attachment = await app.vault.create('report.pdf', 'data');
    await api.addKey(attachment, 'report');
    await app.vault.rename(attachment, 'renamed.pdf');
    await vi.waitFor(() => {
      expect(api.resolve('report')?.path).toBe('renamed.pdf');
    });
    expect(await app.vault.read(attachment)).toBe('data');
    await internals.initializeKeys(internals.pluginSettingsComponent);
    expect(api.resolve('report')?.path).toBe('renamed.pdf');
    await api.addKey(file, 'note');
    await app.fileManager.trashFile(file);
    expect(api.resolve('note')).toBeNull();
    plugin.unload();
  });

  it('rejects access before initialization and an empty property setting', async () => {
    const app = App.createConfigured__().asOriginalType__();
    const plugin = new Plugin(app, MANIFEST);
    const internals = castTo<PluginInternals>(plugin);
    expect(() => internals.getKeyService()).toThrow('not ready');
    await plugin.onload();
    await internals.pluginSettingsComponent.editAndSave((settings) => {
      settings.keyPropertyName = ' ';
    });
    await expect(internals.initializeKeys(internals.pluginSettingsComponent)).rejects.toThrow('must not be empty');
    plugin.unload();
  });

  it('copies permanent links of a multi-file selection as one Markdown list in selection order', async () => {
    const { api, app, file, internals, plugin } = await createFixture();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    const attachment = await app.vault.create('report.pdf', 'data');
    await api.addKey(file, 'existing');
    const folder = await app.vault.createFolder('folder');

    const folderMenu = Menu.create2__();
    const folderAddItem = vi.spyOn(folderMenu, 'addItem');
    app.workspace.trigger('files-menu', folderMenu, [attachment, folder], 'file-explorer');
    expect(folderAddItem).not.toHaveBeenCalled();

    const menu = Menu.create2__();
    const addItem = vi.spyOn(menu, 'addItem');
    app.workspace.trigger('files-menu', menu, [attachment, file], 'file-explorer');
    expect(addItem).toHaveBeenCalled();
    const copyItem = ensureNonNullable(flattenMenuItems(menu).find((item) => item.title__ === 'Copy permanent link'));
    ensureNonNullable(copyItem.onClick__)(new MouseEvent('click'));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const attachmentKey = ensureNonNullable(api.getKeys(attachment)[0]);
    const vault = encodeURIComponent(app.vault.getName());
    expect(writeText).toHaveBeenLastCalledWith(
      `- [report.pdf](obsidian://permanent-links?vault=${vault}&key=${attachmentKey})\n- [note](obsidian://permanent-links?vault=${vault}&key=existing)`
    );
    expect(notice).toHaveBeenLastCalledWith('Permanent links of 2 files copied.');

    await internals.pluginSettingsComponent.editAndSave((settings) => {
      settings.redirectorBaseUrl = 'links.example.com';
    });
    await internals.copyLinks([file], internals.pluginSettingsComponent);
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('copied as obsidian:// links'));
    plugin.unload();
  });

  it('runs the registered commands against the active file', async () => {
    const { api, app, commands, file, plugin } = await createFixture();
    vi.spyOn(app.workspace, 'getActiveFile').mockReturnValue(file);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const copy = ensureNonNullable(commands.mock.calls.find(([command]) => command.id === 'copy-permanent-link')?.[0]);
    copy.checkCallback?.(false);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    vi.mocked(prompt).mockResolvedValueOnce('alias');
    const set = ensureNonNullable(commands.mock.calls.find(([command]) => command.id === 'set-key')?.[0]);
    set.checkCallback?.(false);
    await vi.waitFor(() => {
      expect(api.getKeys(file)).toContain('alias');
    });
    vi.mocked(selectItem).mockResolvedValueOnce('alias');
    vi.mocked(confirm).mockResolvedValueOnce(true);
    const remove = ensureNonNullable(commands.mock.calls.find(([command]) => command.id === 'remove-key')?.[0]);
    remove.checkCallback?.(false);
    await vi.waitFor(() => {
      expect(api.getKeys(file)).not.toContain('alias');
    });
    plugin.unload();
  });

  it('reconciles the changed note from the metadata cache', async () => {
    const { api, app, file, mockApp, plugin } = await createFixture();
    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ frontmatter: { keys: ['from-frontmatter'] } });
    mockApp.metadataCache.trigger('changed', file, '', {});
    await vi.waitFor(() => {
      expect(api.getKeys(file)).toEqual(['from-frontmatter']);
    });
    plugin.unload();
  });

  it('mirrors keys into aliases only while the setting is on', async () => {
    const { api, app, file, internals, mockApp, plugin } = await createFixture();
    await api.addKey(file, 'before');
    expect(await app.vault.read(file)).not.toContain('aliases');
    await internals.pluginSettingsComponent.editAndSave((settings) => {
      settings.shouldMirrorKeysToAliases = true;
    });
    await api.addKey(file, 'after');
    expect(await app.vault.read(file)).toMatch(/aliases:\n {2}- before\n {2}- after/u);
    const write = vi.spyOn(app.fileManager, 'processFrontMatter');
    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ frontmatter: { 'aliases': ['before'], 'keys': ['before', 'after'], 'keys-accepted': ['before', 'after'] } });
    mockApp.metadataCache.trigger('changed', file, '', {});
    await vi.waitFor(() => {
      expect(write).toHaveBeenCalledTimes(1);
    });
    plugin.unload();
  });

  it('retains a frontmatter change arriving while startup persistence is pending', async () => {
    const mockApp = App.createConfigured__();
    const app = mockApp.asOriginalType__();
    app.internalPlugins = castTo<typeof app.internalPlugins>({ getPluginById: () => null });
    const file = await app.vault.create('startup.md', 'Body');
    await app.vault.adapter.mkdir(`${app.vault.configDir}/plugins`);
    await app.vault.adapter.mkdir(`${app.vault.configDir}/plugins/permanent-links`);
    const plugin = new Plugin(app, MANIFEST);
    const internals = castTo<PluginInternals>(plugin);
    await plugin.onload();
    let release: (() => void) | undefined;
    const writing = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = app.vault.adapter.write.bind(app.vault.adapter);
    const writeSpy = vi.spyOn(app.vault.adapter, 'write').mockImplementationOnce(async (path, data) => {
      await writing;
      await write(path, data);
    });
    const initialization = internals.initializeKeys(internals.pluginSettingsComponent);
    await vi.waitFor(() => {
      expect(writeSpy).toHaveBeenCalled();
    });
    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ frontmatter: { keys: ['during-startup'] } });
    mockApp.metadataCache.trigger('changed', file, '', {});
    ensureNonNullable(release)();
    await initialization;
    await vi.waitFor(() => {
      expect(internals.getKeyService().getKeys(file.path)).toEqual(['during-startup']);
    });
    plugin.unload();
  });

  it('refuses malformed frontmatter instead of overwriting it', async () => {
    const { api, app, file, plugin } = await createFixture();
    vi.spyOn(app.fileManager, 'processFrontMatter').mockImplementation(async (_file, action) => {
      await noopAsync();
      action(null);
    });
    await expect(api.addKey(file, 'key')).rejects.toThrow('Frontmatter must be an object');
    expect(api.getKeys(file)).toEqual([]);
    plugin.unload();
  });

  it('renders and binds the configurable frontmatter property', async () => {
    const { internals, plugin } = await createFixture();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent: internals.pluginSettingsComponent });
    const bind = vi.spyOn(tab, 'bind').mockImplementation((params) => params.valueComponent);
    const definitions = tab.getSettingDefinitions();
    for (const definition of definitions) {
      if ('render' in definition) {
        definition.render(new SettingEx(tab.containerEl), castTo<import('obsidian').SettingGroup>(null));
      }
    }
    expect(bind.mock.calls.map(([params]) => params.propertyName)).toEqual(['keyFormat', 'keyPropertyName', 'redirectorBaseUrl', 'shouldMirrorKeysToAliases', 'shouldResolveUniqueFileNames']);
    expect(definitions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Key property name' })]));
    plugin.unload();
  });
});

describe('copy permanent link to heading or block', () => {
  function runCommand(fixture: PluginFixture, line: number, context: import('obsidian').MarkdownFileInfo): void {
    const command = ensureNonNullable(fixture.commands.mock.calls.find(([value]) => value.id === 'copy-permanent-link-to-heading-or-block')?.[0]);
    const editor = castTo<import('obsidian').Editor>({ getCursor: () => ({ ch: 0, line }) });
    expect(command.editorCheckCallback?.(true, editor, castTo<import('obsidian').MarkdownFileInfo>({ file: null }))).toBe(false);
    expect(command.editorCheckCallback?.(true, editor, context)).toBe(true);
    command.editorCheckCallback?.(false, editor, context);
  }

  it('copies a heading link, adds a block id, reuses it, and refuses a blank line', async () => {
    const fixture = await createFixture();
    const { app, file, plugin } = fixture;
    await app.vault.modify(file, '# Plan\n\nFirst paragraph\n\n| a |\n| - |\n| b |\n');
    const writeText = vi.fn(noopAsync);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    const context = castTo<import('obsidian').MarkdownFileInfo>({ file });

    const menu = Menu.create2__();
    const addItem = vi.spyOn(menu, 'addItem');
    app.workspace.trigger('editor-menu', menu, castTo<import('obsidian').Editor>({}), context);
    expect(addItem).toHaveBeenCalled();
    runCommand(fixture, 0, context);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/&key=[a-z0-9]{12}&heading=Plan$/u));
    });

    async function lineOf(text: string): Promise<number> {
      const content = await appRead(file, plugin);
      return content.split('\n').indexOf(text);
    }
    runCommand(fixture, await lineOf('First paragraph'), context);
    await vi.waitFor(async () => {
      expect(await appRead(file, plugin)).toMatch(/First paragraph \^[a-z0-9]{6}\n/u);
    });
    const blockId = ensureNonNullable(/First paragraph \^(?<id>[a-z0-9]{6})/u.exec(await appRead(file, plugin))?.groups?.['id']);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`&block=${blockId}$`, 'u')));
    });

    const contentWithId = await appRead(file, plugin);
    const paragraphLine = contentWithId.split('\n').findIndex((value) => value.startsWith('First paragraph'));
    runCommand(fixture, paragraphLine, context);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(3);
    });
    expect(await appRead(file, plugin)).toBe(contentWithId);

    const tableLine = contentWithId.split('\n').indexOf('| b |');
    runCommand(fixture, tableLine, context);
    await vi.waitFor(async () => {
      expect(await appRead(file, plugin)).toMatch(/\| b \|\n\n\^[a-z0-9]{6}\n/u);
    });

    runCommand(fixture, await lineOf(''), context);
    await vi.waitFor(() => {
      expect(notice).toHaveBeenLastCalledWith('Put the cursor on a heading or a block to copy a permanent link to it.');
    });
    plugin.unload();
  });

  it('saves an open Markdown view before reading the note', async () => {
    const fixture = await createFixture();
    const { app, file, plugin } = fixture;
    await app.vault.modify(file, '# Saved\n');
    const writeText = vi.fn(noopAsync);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const view = Object.create(MarkdownView.prototype) as MarkdownView;
    const save = vi.fn(noopAsync);
    Object.defineProperties(view, { file: { value: file }, save: { value: save } });
    runCommand(fixture, 0, castTo<import('obsidian').MarkdownFileInfo>(view));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/&heading=Saved$/u));
    });
    expect(save).toHaveBeenCalled();
    plugin.unload();
  });
});
interface PluginFixture {
  readonly api: PermanentLinksApi;
  readonly app: import('obsidian').App;
  readonly commands: import('vitest').MockInstance<Plugin['addCommand']>;
  readonly file: TFile;
  readonly internals: PluginInternals;
  readonly mockApp: App;
  readonly plugin: Plugin;
}

function appRead(file: TFile, plugin: Plugin): Promise<string> {
  return plugin.app.vault.read(file);
}
// Cspell:words openmode
