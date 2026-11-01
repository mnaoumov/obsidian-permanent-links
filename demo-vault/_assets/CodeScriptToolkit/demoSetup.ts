import type {
  App,
  TFile
} from 'obsidian';

import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';
import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import { Notice } from 'obsidian';

// Shared code for every `code-button` in this vault, so each note's button stays a one-liner instead of a
// Block copy-pasted across notes.
//
// The plugin id has to match `manifest.json` exactly: commands are keyed by it, and so is `data.json`.
const PLUGIN_ID = 'permanent-links';

const PROJECT_PLAN_PATH = 'Materials/01 Permanent links/Project plan.md';
const NEW_NOTE_PATH = 'Materials/01 Permanent links/New note.md';
const FLOOR_PLAN_PATH = 'Materials/01 Permanent links/floor-plan.svg';

const TRAVEL_LOG_PATH = 'Materials/02 Moved and deleted files/Travel log.md';
const MOVED_TRAVEL_LOG_PATH = 'Materials/02 Moved and deleted files/Trips/Travel log/index.md';
const OLD_DRAFT_PATH = 'Materials/02 Moved and deleted files/Old draft.md';
const OLD_DRAFT_CONTENT = '---\nkeys:\n  - old-draft\nkeys-accepted:\n  - old-draft\n---\n\n# Old draft\n\nThis note exists to be deleted. Follow [Moved and deleted files](<../../02 Moved and deleted files.md>) to see what its permanent link says afterwards.\n';

const KEY_WAIT_TIMEOUT_IN_MILLISECONDS = 5000;
const KEY_WAIT_INTERVAL_IN_MILLISECONDS = 100;

/**
 * The part of the plugin's API (`api.d.ts` in the plugin repository) these buttons read.
 */
interface PermanentLinksApi {
  readonly getKeys: (file: TFile) => readonly string[];
}

/**
 * Optional parts of a permanent link, as they appear in its query string.
 */
interface LinkTarget {
  readonly block?: string;
  readonly heading?: string;
}

/**
 * Copies the permanent link of the attachment `floor-plan.svg`, then opens the attachment through it. An attachment
 * has no frontmatter, so its key lives only in the plugin's `keys.json`.
 *
 * Manual equivalent: right-click `floor-plan.svg` in the File explorer and choose `Copy permanent link`, then paste
 * the link into a browser's address bar.
 */
export async function copyAndOpenAttachmentLink(app: App): Promise<void> {
  const key = await copyPermanentLink(app, FLOOR_PLAN_PATH);
  await openOtherNote(app);
  openPermanentLink(app, key);
}

/**
 * Copies the supplied keyed note so the duplicate repair can be observed.
 *
 * Manual equivalent: duplicate `Keyed note` in the File explorer.
 */
export async function copyKeyedNote(app: App): Promise<void> {
  const source = requireFile(app, 'Materials/03 Key conflicts/Keyed note.md');
  const copy = await app.vault.copy(source, `Materials/03 Key conflicts/Copy ${Date.now().toString()}.md`);
  await app.workspace.getLeaf(false).openFile(copy);
}

/**
 * Creates `New note` if it is missing, then runs `Copy permanent link` on it, which gives it a generated key.
 *
 * Manual equivalent: create any note and run `Permanent Links: Copy permanent link` in the Command Palette.
 */
export async function copyNewNoteLink(app: App): Promise<void> {
  await ensureNewNote(app);
  await copyPermanentLink(app, NEW_NOTE_PATH);
}

/**
 * Copies the permanent link of `Project plan`, then opens the note through that link from another note.
 *
 * Manual equivalent: open `Project plan`, run `Permanent Links: Copy permanent link`, and paste the link into a
 * browser's address bar.
 */
export async function copyAndOpenProjectPlanLink(app: App): Promise<void> {
  const key = await copyPermanentLink(app, PROJECT_PLAN_PATH);
  await openOtherNote(app);
  openPermanentLink(app, key);
}

/**
 * Deletes `Old draft`, so its permanent link reports the deletion instead of opening it.
 *
 * Manual equivalent: delete `Old draft` in the File explorer.
 */
export async function deleteOldDraft(app: App): Promise<void> {
  const file = app.vault.getFileByPath(OLD_DRAFT_PATH);
  if (!file) {
    new Notice('Old draft is already deleted. Restore it with the last button in the note.');
    return;
  }
  await app.fileManager.trashFile(file);
  new Notice('Old draft is deleted. Its permanent key is kept as a deleted-key record.');
}

/**
 * Moves `Travel log` into a folder of its own, as `Trips/Travel log/index.md`.
 *
 * Manual equivalent: drag `Travel log` into another folder, or rename it, in the File explorer.
 */
export async function moveTravelLog(app: App): Promise<void> {
  await moveFile(app, TRAVEL_LOG_PATH, MOVED_TRAVEL_LOG_PATH);
}

/**
 * Moves `Travel log` back where it started.
 *
 * Manual equivalent: move it back in the File explorer.
 */
export async function moveTravelLogBack(app: App): Promise<void> {
  await moveFile(app, MOVED_TRAVEL_LOG_PATH, TRAVEL_LOG_PATH);
}

/**
 * Opens a permanent link of this vault from another note, exactly as Obsidian does when an
 * `obsidian://permanent-links?...` link is clicked.
 *
 * Manual equivalent: paste the link into a browser's address bar, or click it in a note or a message.
 */
export function openPermanentLink(app: App, key: string, target: LinkTarget = {}): void {
  const handler = app.workspace.protocolHandler.handlers.get(PLUGIN_ID);
  if (!handler) {
    throw new Error('Permanent Links is not enabled.');
  }
  handler({ action: PLUGIN_ID, key, vault: app.vault.getName(), ...target });
}

/**
 * Opens `Project plan` through its permanent link, scrolled to a heading.
 *
 * Manual equivalent: add `&heading=Budget` to the note's permanent link.
 */
export async function openProjectPlanHeading(app: App): Promise<void> {
  await openOtherNote(app);
  openPermanentLink(app, 'project-plan', { heading: 'Budget' });
}

/**
 * Opens `Project plan` through its permanent link, scrolled to a block.
 *
 * Manual equivalent: add `&block=deadline` to the note's permanent link.
 */
export async function openProjectPlanBlock(app: App): Promise<void> {
  await openOtherNote(app);
  openPermanentLink(app, 'project-plan', { block: 'deadline' });
}

/**
 * Makes sure `New note` exists and has a key, then runs `Remove key` on it, which asks before removing.
 *
 * Manual equivalent: open a keyed note and run `Permanent Links: Remove key` in the Command Palette.
 */
export async function removeNewNoteKey(app: App): Promise<void> {
  await copyNewNoteLink(app);
  app.commands.executeCommandById(`${PLUGIN_ID}:remove-key`);
}

/**
 * Brings `Old draft` back at its old path, which revives its permanent key.
 *
 * Manual equivalent: restore the note from the trash, or recreate it at the same path.
 */
export async function restoreOldDraft(app: App): Promise<void> {
  if (app.vault.getFileByPath(OLD_DRAFT_PATH)) {
    new Notice('Old draft is already in place.');
    return;
  }
  await app.vault.create(OLD_DRAFT_PATH, OLD_DRAFT_CONTENT);
  new Notice('Old draft is back, and its permanent link opens it again.');
}

/**
 * Runs `List and purge deleted keys`, which lists every deleted key with its last path and deletion time.
 *
 * Manual equivalent: `Permanent Links: List and purge deleted keys` in the Command Palette.
 */
export function listDeletedKeys(app: App): void {
  app.commands.executeCommandById(`${PLUGIN_ID}:manage-deleted-keys`);
}

/**
 * Opens `Project plan` and runs `Set key`, which asks for a readable key to add as an alias.
 *
 * Manual equivalent: open the note and run `Permanent Links: Set key` in the Command Palette.
 */
export async function setProjectPlanKey(app: App): Promise<void> {
  await app.workspace.getLeaf(false).openFile(requireFile(app, PROJECT_PLAN_PATH));
  app.commands.executeCommandById(`${PLUGIN_ID}:set-key`);
}

/**
 * Turns `shouldResolveUniqueFileNames` on or off.
 *
 * `configureCommunityPlugin` routes through the plugin's own settings component while it is loaded, so the
 * change applies live -- no window reload, and no writing `data.json` behind a running plugin's back, which
 * it would overwrite from memory as it unloads.
 *
 * Manual equivalent: the `Resolve unique file names` toggle in **Settings -> Community plugins -> Permanent Links**.
 */
export async function setShouldResolveUniqueFileNames(app: App, value: boolean): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { shouldResolveUniqueFileNames: value } });
  new Notice(`shouldResolveUniqueFileNames is now ${String(value)}. It is live -- no reload needed.`);
}

/**
 * Opens the link `key=floor-plan`, a key nobody assigned. It opens `floor-plan.svg` only while
 * `shouldResolveUniqueFileNames` is on.
 *
 * Manual equivalent: paste the same link into a browser's address bar.
 */
export async function openFloorPlanByName(app: App): Promise<void> {
  await openOtherNote(app);
  openPermanentLink(app, 'floor-plan');
}

/**
 * Opens `Travel log` through its permanent link, wherever it is now.
 *
 * Manual equivalent: open the note's permanent link from a browser's address bar.
 */
export async function openTravelLogLink(app: App): Promise<void> {
  await openOtherNote(app);
  openPermanentLink(app, 'travel-log');
}

/**
 * Opens the permanent link of the deleted `Old draft`.
 *
 * Manual equivalent: open the note's permanent link from a browser's address bar.
 */
export async function openOldDraftLink(app: App): Promise<void> {
  await openOtherNote(app);
  openPermanentLink(app, 'old-draft');
}

async function copyPermanentLink(app: App, path: string): Promise<string> {
  const file = requireFile(app, path);
  await app.workspace.getLeaf(false).openFile(file);
  app.commands.executeCommandById(`${PLUGIN_ID}:copy-permanent-link`);
  const key = await waitForKey(app, file);
  const link = `obsidian://permanent-links?vault=${encodeURIComponent(app.vault.getName())}&key=${encodeURIComponent(key)}`;
  new Notice(`Copied ${link}`);
  return key;
}

async function ensureNewNote(app: App): Promise<TFile> {
  return app.vault.getFileByPath(NEW_NOTE_PATH)
    ?? await app.vault.create(NEW_NOTE_PATH, '# New note\n\nCreated by a button in `01 Permanent links`. It is gitignored, so it stays out of your repository.\n');
}

function getApi(): PermanentLinksApi {
  const api = findPluginApi<PermanentLinksApi>({ apiVersionRange: '^1.1.0', pluginId: PLUGIN_ID });
  if (!api) {
    throw new Error('Permanent Links is not enabled.');
  }
  return api;
}

async function moveFile(app: App, fromPath: string, toPath: string): Promise<void> {
  const file = app.vault.getFileByPath(fromPath);
  if (!file) {
    new Notice(`Nothing to move: ${fromPath} does not exist.`);
    return;
  }
  const folderPath = toPath.slice(0, toPath.lastIndexOf('/'));
  if (!app.vault.getFolderByPath(folderPath)) {
    await app.vault.createFolder(folderPath);
  }
  await app.fileManager.renameFile(file, toPath);
  new Notice(`Moved to ${toPath}.`);
}

/**
 * Leaves the target note, so opening it through its link visibly changes the active note.
 */
async function openOtherNote(app: App): Promise<void> {
  await app.workspace.getLeaf(false).openFile(requireFile(app, '00 Start.md'));
}

function requireFile(app: App, path: string): TFile {
  const file = app.vault.getFileByPath(path);
  if (!file) {
    throw new Error(`The demo file ${path} is missing.`);
  }
  return file;
}

async function waitForKey(app: App, file: TFile): Promise<string> {
  const api = getApi();
  const deadline = Date.now() + KEY_WAIT_TIMEOUT_IN_MILLISECONDS;
  while (Date.now() < deadline) {
    const key = api.getKeys(file)[0];
    if (key) {
      return key;
    }
    await sleep(KEY_WAIT_INTERVAL_IN_MILLISECONDS);
  }
  throw new Error(`${file.path} received no permanent key.`);
}
