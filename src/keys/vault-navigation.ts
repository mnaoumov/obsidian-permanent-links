import type { App } from 'obsidian';

import { noop } from '@mnaoumov/typescript-lib/function';

interface DestinationVault {
  readonly name: string;
  readonly path: string;
}

interface MobileFolderPicker {
  readonly choose: () => Promise<unknown>;
}

interface NativeUriEmitter {
  readonly emit: (name: string, $event: NativeUriEvent, url: string) => boolean;
}

interface NativeUriEvent {
  readonly preventDefault: () => void;
}

export function listVaults(app: App): DestinationVault[] {
  if (app.isMobile) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Reads Obsidian's browser device-wide registry, not Node's experimental localStorage.
    const raw: unknown = JSON.parse(window.localStorage.getItem('mobile-external-vaults') ?? '[]');
    if (!Array.isArray(raw) || !raw.every((path): path is string => typeof path === 'string')) {
      throw new Error('Invalid mobile vault registry.');
    }
    return raw.map((path) => destination(path));
  }
  const raw: unknown = window.electron.ipcRenderer.sendSync('vault-list');
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Unavailable desktop vault registry.');
  }
  return Object.values(raw).map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('path' in entry) || typeof entry.path !== 'string') {
      throw new Error('Invalid desktop vault registry.');
    }
    return destination(entry.path);
  });
}

export function openVaultUri(app: App, url: string): void {
  if (app.isMobile) {
    app.workspace.protocolHandler.execCapacitorUrl(url);
    return;
  }
  const emitter: unknown = window.electron.remote.app;
  if (!checkNativeUriEmitter(emitter) || !emitter.emit('open-url', { preventDefault: noop }, url)) {
    throw new Error('Native Obsidian URI dispatch is unavailable.');
  }
}

export async function pickVaultFolder(app: App): Promise<DestinationVault | null> {
  if (app.isMobile) {
    const picker: unknown = window.Capacitor.Plugins.Filesystem;
    if (!checkMobileFolderPicker(picker)) {
      throw new Error('Folder selection is unavailable on this device. Register the destination in Obsidian first.');
    }
    const selection = await picker.choose();
    if (typeof selection !== 'object' || selection === null || !('path' in selection) || typeof selection.path !== 'string' || !selection.path) {
      return null;
    }
    if ('isRoot' in selection && selection.isRoot === true) {
      throw new Error('Choose a vault folder, not the root folder of your device.');
    }
    return destination(selection.path);
  }
  const selection = await window.electron.remote.dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose destination vault folder' });
  const path = selection.filePaths[0];
  if (selection.canceled || !path) {
    return null;
  }
  // A failed or unavailable unofficial registration leaves the trusted destination copyable.
  try {
    window.electron.ipcRenderer.sendSync('vault-open', path, false);
  } catch {
    return destination(path);
  }
  return destination(path);
}

function checkMobileFolderPicker(value: unknown): value is MobileFolderPicker {
  // Capacitor plugins expose native methods through a Proxy getter, not own properties.
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'choose') === 'function';
}

function checkNativeUriEmitter(value: unknown): value is NativeUriEmitter {
  return typeof value === 'object' && value !== null && 'emit' in value && typeof value.emit === 'function';
}

function destination(path: string): DestinationVault {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/u, '');
  return { name: normalized.slice(normalized.lastIndexOf('/') + 1), path };
}
