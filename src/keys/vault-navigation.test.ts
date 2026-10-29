// Cspell:words sdcard unstub
import type { App } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import {
  listVaults,
  openVaultUri,
  pickVaultFolder
} from './vault-navigation.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it('reads desktop vault names from the registry and registers a selected existing folder', async () => {
  const sendSync = vi.fn().mockReturnValue({ a: { path: String.raw`C:\Vault A` }, b: { path: '/other/Vault B/' } });
  const emit = vi.fn().mockReturnValue(true);
  const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: [String.raw`C:\New vault`] });
  vi.stubGlobal('electron', { ipcRenderer: { sendSync }, remote: { app: { emit }, dialog: { showOpenDialog } } });
  const app = castTo<App>({ isMobile: false });
  expect(listVaults(app)).toEqual([{ name: 'Vault A', path: String.raw`C:\Vault A` }, { name: 'Vault B', path: '/other/Vault B/' }]);
  sendSync.mockReturnValue(true);
  expect(await pickVaultFolder(app)).toEqual({ name: 'New vault', path: String.raw`C:\New vault` });
  expect(sendSync).toHaveBeenLastCalledWith('vault-open', String.raw`C:\New vault`, false);
  openVaultUri(app, 'obsidian://permanent-links?vault=Other&key=key');
  expect(emit).toHaveBeenCalledWith('open-url', expect.any(Object), expect.stringContaining('vault=Other'));
  const $event = castTo<Pick<Event, 'preventDefault'>>(emit.mock.calls[0]?.[1]);
  $event.preventDefault();
});

it('fails safely on unavailable or malformed desktop internals and handles folder cancellation', async () => {
  const app = castTo<App>({ isMobile: false });
  vi.stubGlobal('electron', undefined);
  expect(() => listVaults(app)).toThrow();
  expect(() => {
    openVaultUri(app, 'uri');
  }).toThrow();
  await expect(pickVaultFolder(app)).rejects.toThrow();
  const sendSync = vi.fn().mockReturnValue(null);
  const showOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] });
  vi.stubGlobal('electron', { ipcRenderer: { sendSync }, remote: { app: {}, dialog: { showOpenDialog } } });
  expect(() => listVaults(app)).toThrow();
  expect(() => {
    openVaultUri(app, 'uri');
  }).toThrow();
  expect(await pickVaultFolder(app)).toBeNull();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });
  expect(await pickVaultFolder(app)).toBeNull();
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/vault'] });
  sendSync.mockReturnValue('Vault registration failed');
  expect(await pickVaultFolder(app)).toEqual({ name: 'vault', path: '/vault' });
  sendSync.mockReturnValue({ bad: { path: 3 } });
  expect(() => listVaults(app)).toThrow();
});

it('reads mobile vault registrations and dispatches through the mobile URI parser', () => {
  const execCapacitorUrl = vi.fn();
  const app = castTo<App>({ isMobile: true, workspace: { protocolHandler: { execCapacitorUrl } } });
  expect(listVaults(app)).toEqual([]);
  window.localStorage.setItem('mobile-external-vaults', JSON.stringify(['/sdcard/A', '/sdcard/B']));
  expect(listVaults(app)).toEqual([{ name: 'A', path: '/sdcard/A' }, { name: 'B', path: '/sdcard/B' }]);
  openVaultUri(app, 'obsidian://permanent-links?vault=B&key=key');
  expect(execCapacitorUrl).toHaveBeenCalledWith('obsidian://permanent-links?vault=B&key=key');
  window.localStorage.setItem('mobile-external-vaults', '{}');
  expect(() => listVaults(app)).toThrow();
  window.localStorage.setItem('mobile-external-vaults', '[42]');
  expect(() => listVaults(app)).toThrow();
});

it('selects a mobile vault folder without inspecting or registering its contents', async () => {
  const app = castTo<App>({ isMobile: true });
  for (const picker of [undefined, null, 42, {}, { choose: 'invalid' }]) {
    vi.stubGlobal('Capacitor', { Plugins: { Filesystem: picker } });
    await expect(pickVaultFolder(app)).rejects.toThrow('unavailable');
  }
  const choose = vi.fn<() => Promise<unknown>>();
  vi.stubGlobal('Capacitor', { Plugins: { Filesystem: { choose } } });
  for (const selection of [undefined, null, 42, {}, { path: 42 }, { path: '' }]) {
    choose.mockResolvedValue(selection);
    expect(await pickVaultFolder(app)).toBeNull();
  }
  choose.mockResolvedValue({ isRoot: true, path: '/sdcard' });
  await expect(pickVaultFolder(app)).rejects.toThrow('root folder');
  choose.mockResolvedValue({ isRoot: false, path: '/sdcard/Chosen' });
  expect(await pickVaultFolder(app)).toEqual({ name: 'Chosen', path: '/sdcard/Chosen' });
  choose.mockResolvedValue({ path: '/sdcard/Other' });
  expect(await pickVaultFolder(app)).toEqual({ name: 'Other', path: '/sdcard/Other' });
  const dynamicPicker = new Proxy({}, {
    get(_target, name): unknown {
      return name === 'choose' ? choose : undefined;
    }
  });
  vi.stubGlobal('Capacitor', { Plugins: { Filesystem: dynamicPicker } });
  expect(await pickVaultFolder(app)).toEqual({ name: 'Other', path: '/sdcard/Other' });
});

it('guards native dispatch and keeps a selected destination when desktop registration fails', async () => {
  const app = castTo<App>({ isMobile: false });
  const emit = vi.fn().mockReturnValue(false);
  const sendSync = vi.fn().mockImplementation(() => {
    throw new Error('Missing IPC');
  });
  const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/Chosen'] });
  vi.stubGlobal('electron', { ipcRenderer: { sendSync }, remote: { app: { emit }, dialog: { showOpenDialog } } });
  expect(() => {
    openVaultUri(app, 'uri');
  }).toThrow('unavailable');
  expect(await pickVaultFolder(app)).toEqual({ name: 'Chosen', path: '/Chosen' });
  for (const raw of [[], 42, { bad: null }, { bad: 42 }, { bad: {} }]) {
    sendSync.mockReturnValue(raw);
    expect(() => listVaults(app)).toThrow();
  }
  for (const emitter of [null, 42, { emit: 42 }]) {
    vi.stubGlobal('electron', { remote: { app: emitter } });
    expect(() => {
      openVaultUri(app, 'uri');
    }).toThrow('unavailable');
  }
});
