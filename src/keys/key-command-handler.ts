import type {
  IconName,
  TFile
} from 'obsidian';

import { FileCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/file-command-handler';

interface KeyCommandHandlerConstructorParams {
  readonly execute: (file: TFile) => Promise<void>;
  readonly icon: IconName;
  readonly id: string;
  readonly name: string;
}

export class KeyCommandHandler extends FileCommandHandler {
  private readonly action: (file: TFile) => Promise<void>;

  public constructor(params: KeyCommandHandlerConstructorParams) {
    super({ ...params, shouldAddCommandToSubmenu: true });
    this.action = params.execute;
  }

  protected override executeFile(file: TFile): Promise<void> {
    return this.action(file);
  }
}
