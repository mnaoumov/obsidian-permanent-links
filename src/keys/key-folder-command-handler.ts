import type { TFolder } from 'obsidian';

import { FolderCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/folder-command-handler';

/**
 * Key every file in folder: a folder context-menu item, and a command-palette command for the active folder.
 */
export class KeyFolderCommandHandler extends FolderCommandHandler {
  private readonly action: (folder: TFolder) => Promise<void>;

  public constructor(action: (folder: TFolder) => Promise<void>) {
    super({ icon: 'key-round', id: 'key-every-file-in-folder', name: 'Key every file in folder', shouldAddCommandToSubmenu: true });
    this.action = action;
  }

  protected override executeFolder(folder: TFolder): Promise<void> {
    return this.action(folder);
  }

  protected override shouldAddToFolderMenu(): boolean {
    return true;
  }
}
