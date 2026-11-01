/**
 * @file
 *
 * The staging closures the desktop and the Android capture suites share. Each frame is staged by `startStage`,
 * which sets it up and returns at once, and is read by `pollStage` until it shows what the frame needs, both
 * through `pollInObsidian`, so every wait happens in Node and no closure comes near the transport's per-eval cap.
 *
 * Both functions are serialized into Obsidian, so neither may reach anything outside its own body: every constant
 * and helper they use is declared inside them.
 */

import type {
  FileExplorerView,
  FileTreeItem,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type {
  ObsidianProtocolData,
  TFile
} from 'obsidian';
import type { CommonArguments } from 'obsidian-integration-testing';

/**
 * What {@link reserveCaptionBand} is given.
 */
export interface ReserveCaptionBandInput {
  /**
   * The height of the caption band `labelScreenshot` draws over the bottom of the frame.
   */
  readonly bandHeightInPixels: number;
}

/**
 * A frame the capture suites can stage.
 */
export type ScreenshotStage = 'deleted' | 'edit' | 'keys' | 'moved' | 'settings';

/**
 * What a stage closure is given.
 */
export interface StageInput {
  /**
   * The frame to stage.
   */
  readonly stage: ScreenshotStage;
}

/**
 * A record of the plugin's `keys.json`, as far as the deleted-note frame reads it.
 */
interface KeyStoreEntry {
  readonly deletedAt?: string;
  readonly key: string;
}

/**
 * Reads whether the metadata cache has resolved the links of every note.
 *
 * Until it has, the status bar's count of links to the open note is still climbing, so a frame taken earlier differs
 * from one taken on the next run.
 *
 * @param params - The closure arguments.
 * @returns Whether every note's links are resolved.
 */
export function areAllLinksResolved({ app }: CommonArguments): boolean {
  return app.vault.getMarkdownFiles().every((file) => Object.hasOwn(app.metadataCache.resolvedLinks, file.path));
}

/**
 * Reads whether the staged frame is ready, and what it shows.
 *
 * @param params - The closure arguments.
 * @returns What the frame shows, or an empty string while it is not ready.
 */
export function pollStage({ app, stage }: CommonArguments & StageInput): string {
  const PLUGIN_ID = 'permanent-links';
  const MOVED_PATH = 'Materials/02 Moved and deleted files/Trips/Travel log/index.md';

  const readers: Record<ScreenshotStage, () => string> = {
    deleted: () => activeDocument.querySelector(':scope .notice')?.textContent.includes('was deleted on') ? 'deleted' : '',
    edit: () => activeDocument.querySelector(':scope .modal-container button[data-choice="redirect"]') ? 'edit' : '',
    keys: () => {
      const text = app.workspace.getMostRecentLeaf()?.view.containerEl.querySelector(':scope .metadata-container')?.textContent ?? '';
      return text.includes('plan-2026') ? 'keys' : '';
    },
    moved: () => app.workspace.getActiveFile()?.path === MOVED_PATH && app.workspace.getMostRecentLeaf()?.view.containerEl.querySelector(':scope h1') ? 'moved' : '',
    settings: () => app.setting.activeTab?.id === PLUGIN_ID && app.setting.activeTab.containerEl.querySelector('.setting-item-name') ? 'settings' : ''
  };
  return readers[stage]();
}

/**
 * Lays the app out above the caption band rather than under it.
 *
 * `labelScreenshot` draws its band over the bottom of the frame, on the grounds that the bottom is chrome. Here the
 * notices of two frames sit in the app's corner, so the band is kept clear of everything the app draws.
 *
 * @param params - The closure arguments.
 */
export function reserveCaptionBand({ bandHeightInPixels, obsidianModule }: CommonArguments & ReserveCaptionBandInput): void {
  /*
   * The band is measured in the frame's pixels. A desktop frame is shot at one CSS pixel per pixel, but a phone's is
   * its framebuffer, at the device's pixel ratio.
   */
  const pixelRatio = obsidianModule.Platform.isMobile ? activeWindow.devicePixelRatio : 1;
  const band = `${String(bandHeightInPixels / pixelRatio)}px`;
  activeDocument.querySelector<HTMLElement>(':scope .app-container')?.setCssStyles({ height: `calc(100% - ${band})` });
  // The status bar and a phone's navigation bar are fixed to the viewport rather than laid out in the app, so they are
  // Lifted on their own.
  for (const el of activeDocument.querySelectorAll<HTMLElement>(':scope :is(.status-bar, .mobile-navbar)')) {
    el.setCssStyles({ bottom: band });
  }
}

/**
 * Stages a frame: dismisses whatever the last frame left open, then sets up and performs what the frame is about.
 *
 * @param params - The closure arguments.
 */
export async function startStage({ app, lib, obsidianModule, stage }: CommonArguments & StageInput): Promise<void> {
  const PLUGIN_ID = 'permanent-links';
  const START_PATH = '00 Start.md';
  const PROJECT_PLAN_PATH = 'Materials/01 Permanent links/Project plan.md';
  const MOVED_FOLDER = 'Materials/02 Moved and deleted files';
  const TRAVEL_LOG_PATH = `${MOVED_FOLDER}/Travel log.md`;
  const MOVED_PATH = `${MOVED_FOLDER}/Trips/Travel log/index.md`;
  const OLD_DRAFT_PATH = `${MOVED_FOLDER}/Old draft.md`;
  const KEYED_NOTE_PATH = 'Materials/03 Key conflicts/Keyed note.md';
  const WAIT_TIMEOUT_IN_MILLISECONDS = 10_000;
  const NOTICE_HOLD_IN_MILLISECONDS = 30_000;
  const { isMobile } = obsidianModule.Platform;

  await dismissLeftovers();

  switch (stage) {
    case 'deleted': {
      await showInExplorer([MOVED_FOLDER]);
      const oldDraft = app.vault.getFileByPath(OLD_DRAFT_PATH);
      if (oldDraft) {
        await app.fileManager.trashFile(oldDraft);
      }
      await openNote(START_PATH, 'preview');
      await waitForDeletedKey('old-draft');
      /*
       * A notice hides itself after four seconds, and a phone's frame is shot later than that. Its hide is a no-op until
       * the frame is long taken; the next frame detaches every notice itself.
       */
      const noticePrototype = obsidianModule.Notice.prototype;
      const originalHide = noticePrototype.hide;
      noticePrototype.hide = function hide(): void {
        // Kept on screen for the frame.
      };
      window.setTimeout(() => {
        noticePrototype.hide = originalHide;
      }, NOTICE_HOLD_IN_MILLISECONDS);
      openLink('old-draft');
      break;
    }
    case 'edit': {
      await showInExplorer(['Materials/03 Key conflicts']);
      await openNote(KEYED_NOTE_PATH, 'source');
      // Startup gives the keyed note its acceptance receipt, and a change made before that is accepted rather than asked about.
      await lib.waitUntil({
        message: 'the keyed note to receive its acceptance receipt',
        predicate: () => app.metadataCache.getFileCache(requireFile(KEYED_NOTE_PATH))?.frontmatter?.['keys-accepted'] !== undefined,
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      // An edit by hand: the first occurrence is the `keys` list, and the receipt below it is left alone, as when a reader
      // Types in the editor.
      await app.vault.process(requireFile(KEYED_NOTE_PATH), (text) => text.replace('  - demo-conflict-original', '  - demo-conflict-renamed'));
      break;
    }
    case 'keys': {
      await showInExplorer(['Materials/01 Permanent links']);
      // What `Set key` writes: the alias after the primary key, accepted in the receipt so no dialog asks about it.
      await app.fileManager.processFrontMatter(requireFile(PROJECT_PLAN_PATH), (frontmatter: Record<string, unknown>) => {
        frontmatter['keys'] = ['project-plan', 'plan-2026'];
        frontmatter['keys-accepted'] = ['project-plan', 'plan-2026'];
      });
      await openNote(PROJECT_PLAN_PATH, 'source');
      break;
    }
    case 'moved': {
      const travelLog = app.vault.getFileByPath(TRAVEL_LOG_PATH);
      if (travelLog) {
        await app.vault.createFolder(`${MOVED_FOLDER}/Trips/Travel log`);
        await app.fileManager.renameFile(travelLog, MOVED_PATH);
      }
      // After the move, so the explorer has the new folders to expand.
      await showInExplorer([MOVED_FOLDER, `${MOVED_FOLDER}/Trips`, `${MOVED_FOLDER}/Trips/Travel log`]);
      await openNote(START_PATH, 'preview');
      await lib.waitUntil({
        message: 'the moved key to follow its note',
        predicate: () => {
          const moved = app.vault.getFileByPath(MOVED_PATH);
          return !!moved && app.metadataCache.getFileCache(moved)?.frontmatter?.['keys'] !== undefined;
        },
        timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      });
      // The core `Updated 2 links in 2 files.` notice of the move is not what the frame is about.
      for (const el of activeDocument.querySelectorAll(':scope .notice')) {
        el.detach();
      }
      openLink('travel-log');
      break;
    }
    case 'settings': {
      // On mobile the settings modal is not in the document until something attaches it.
      const { containerEl } = app.setting;
      if (!activeDocument.body.contains(containerEl)) {
        activeDocument.body.append(containerEl);
      }
      app.setting.open();
      app.setting.openTabById(PLUGIN_ID);
      // The tab keeps the scroll it had when it was last open, which differs between runs.
      app.setting.activeTab?.containerEl.scrollTo({ top: 0 });
      break;
    }
    default: {
      break;
    }
  }

  async function dismissLeftovers(): Promise<void> {
    if (activeDocument.body.contains(app.setting.containerEl)) {
      app.setting.close();
    }
    if (activeDocument.querySelector(':scope .modal-container')) {
      activeDocument.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    }
    await lib.waitUntil({
      message: 'the last frame\'s modal to close',
      predicate: () => activeDocument.querySelector(':scope .modal-container') === null,
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    });
    for (const el of activeDocument.querySelectorAll(':scope .menu, :scope .notice, :scope .tooltip')) {
      el.detach();
    }
  }

  function isFolderItem(item: FileTreeItem | FolderTreeItem): item is FolderTreeItem {
    return 'vChildren' in item;
  }

  /**
   * Opens a permanent link of this vault exactly as Obsidian does when an `obsidian://permanent-links?...` link is
   * clicked.
   */
  function openLink(key: string): void {
    const handler = app.workspace.protocolHandler.handlers.get(PLUGIN_ID);
    if (!handler) {
      throw new Error('No permanent-links protocol handler.');
    }
    // The type carries a brand no literal can satisfy; the handler reads only these three fields.
    const params = Object.fromEntries([['action', PLUGIN_ID], ['key', key], ['vault', app.vault.getName()]]) as ObsidianProtocolData;
    handler(params);
  }

  async function openNote(path: string, mode: 'preview' | 'source'): Promise<void> {
    await app.workspace.getLeaf(false).setViewState({ active: true, state: { file: path, mode, source: false }, type: 'markdown' });
  }

  function requireFile(path: string): TFile {
    const file = app.vault.getFileByPath(path);
    if (!file) {
      throw new Error(`No ${path}.`);
    }
    return file;
  }

  /**
   * Expands `Materials` and the given folders, collapses every other one, and shows the explorer. A phone's explorer
   * is a drawer that would cover the note, so there it stays closed.
   */
  async function showInExplorer(expandedFolderPaths: readonly string[]): Promise<void> {
    if (isMobile) {
      return;
    }
    const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
    if (!leaf) {
      throw new Error('No File explorer leaf.');
    }
    await leaf.loadIfDeferred();
    app.workspace.leftSplit.expand();
    await app.workspace.revealLeaf(leaf);
    const view = leaf.view as FileExplorerView;
    const expandedPaths = new Set(['Materials', ...expandedFolderPaths]);
    for (const item of Object.values(view.fileItems)) {
      if (isFolderItem(item) && item.file.path !== '/') {
        await item.setCollapsed(!expandedPaths.has(item.file.path));
      }
    }
  }

  async function waitForDeletedKey(key: string): Promise<void> {
    const storePath = `${app.vault.configDir}/plugins/${PLUGIN_ID}/keys.json`;
    await lib.waitUntil({
      message: `the deletion of ${key} to be recorded`,
      predicate: async () => {
        const text = await app.vault.adapter.read(storePath);
        return (JSON.parse(text) as KeyStoreEntry[]).some((entry) => entry.key === key && entry.deletedAt !== undefined);
      },
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    });
  }
}
