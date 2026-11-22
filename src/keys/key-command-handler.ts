import type { FileCommandHandlerShouldAddToFilesMenuParams } from '@mnaoumov/obsidian-lib/command-handlers/file-command-handler';
import type {
  IconName,
  TFile
} from 'obsidian';

import { FileCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/file-command-handler';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

interface KeyCommandHandlerConstructorParams {
  readonly execute: (file: TFile) => Promise<void>;
  /**
   * Runs the command once for a multi-file selection in the File explorer. Without it, the command is not offered
   * in the multi-file menu.
   */
  readonly executeFiles?: (files: TFile[]) => Promise<void>;
  readonly icon: IconName;
  readonly id: string;
  readonly name: string;
}

type KeyCommandHandlerShouldAddToFilesMenuParams = FileCommandHandlerShouldAddToFilesMenuParams;

export class KeyCommandHandler extends FileCommandHandler {
  private readonly action: (file: TFile) => Promise<void>;
  private readonly filesAction: ((files: TFile[]) => Promise<void>) | undefined;

  public constructor(params: KeyCommandHandlerConstructorParams) {
    super({ icon: params.icon, id: params.id, name: params.name, shouldAddCommandToSubmenu: true });
    this.action = params.execute;
    this.filesAction = params.executeFiles;
  }

  protected override executeFile(file: TFile): Promise<void> {
    return this.action(file);
  }

  protected override executeFiles(files: TFile[]): Promise<void> {
    // Only reachable from the multi-file menu, which offers the command only when it has a multi-file action.
    return ensureNonNullable(this.filesAction)(files);
  }

  protected override shouldAddToFilesMenu(_params: KeyCommandHandlerShouldAddToFilesMenuParams): boolean {
    return this.filesAction !== undefined;
  }
}
