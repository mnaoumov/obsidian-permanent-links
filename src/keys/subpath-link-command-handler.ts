import type {
  Editor,
  MarkdownFileInfo,
  TFile
} from 'obsidian';

import { EditorCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/editor-command-handler';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

/**
 * The editor command, and editor-menu item, that copies a permanent link to the heading or block at the cursor.
 */
export class SubpathLinkCommandHandler extends EditorCommandHandler {
  private readonly action: (editor: Editor, context: MarkdownFileInfo, file: TFile) => Promise<void>;

  public constructor(execute: (editor: Editor, context: MarkdownFileInfo, file: TFile) => Promise<void>) {
    super({
      icon: 'link',
      id: 'copy-permanent-link-to-heading-or-block',
      name: 'Copy permanent link to heading or block',
      shouldAddCommandToSubmenu: true
    });
    this.action = execute;
  }

  protected override canExecuteEditor(_editor: Editor, context: MarkdownFileInfo): boolean {
    return context.file?.extension === 'md';
  }

  protected override async executeEditor(editor: Editor, context: MarkdownFileInfo): Promise<void> {
    await this.action(editor, context, ensureNonNullable(context.file));
  }

  protected override shouldAddToEditorMenu(editor: Editor, context: MarkdownFileInfo): boolean {
    return this.canExecuteEditor(editor, context);
  }
}
