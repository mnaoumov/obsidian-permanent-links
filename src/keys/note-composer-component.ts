import type {
  App,
  TFile
} from 'obsidian';

import { CorePluginToggleComponent } from '@mnaoumov/obsidian-lib/components/core-plugin-toggle-component';
import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { confirm } from '@mnaoumov/obsidian-lib/modals/confirm';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { noop } from '@mnaoumov/typescript-lib/function';
import { Component } from 'obsidian';

import type { KeyService } from './key-service.ts';

interface NoteComposerComponentOfferTransferParams {
  readonly isActive: () => boolean;
  readonly keys: readonly string[];
  readonly sourcePath: string;
  readonly target: TFile;
}

export class NoteComposerComponent extends Component {
  public constructor(private readonly app: App, private readonly service: KeyService) {
    super();
  }

  public override onload(): void {
    let patches: MonkeyAroundComponent | undefined;
    const disable = (): void => {
      if (!patches) {
        return;
      }

      this.removeChild(patches);
      patches = undefined;
    };
    this.addChild(
      new CorePluginToggleComponent({
        app: this.app,
        corePluginId: 'note-composer',
        onDisable: disable,
        onEnable: (): void => {
          const composer = this.app.internalPlugins.getPluginById('note-composer')?.instance;
          if (!composer) {
            return;
          }
          const patch = this.addChild(new MonkeyAroundComponent());
          patches = patch;
          let isActive = true;
          patch.register(() => {
            isActive = false;
          });
          patch.registerMethodPatch({
            $object: composer,
            methodName: 'mergeFile',
            patchHandler: ({ fallback, originalArguments: [target, source] }) => {
              const sourcePath = source.path;
              const keys = this.service.getKeys(sourcePath);
              const result = fallback();
              result.then(() => {
                invokeAsyncSafely(() => this.offerTransfer({ isActive: () => isActive, keys, sourcePath, target }));
              }).catch(noop);
              return result;
            }
          });
        },
        shouldCallOnDisableOnUnload: true
      })
    );
  }

  private async offerTransfer(params: NoteComposerComponentOfferTransferParams): Promise<void> {
    const { isActive, keys, sourcePath, target } = params;
    const targetPath = target.path;
    const isCurrent = (): boolean =>
      isActive()
      && this.app.vault.getAbstractFileByPath(sourcePath) === null
      && this.app.vault.getFileByPath(targetPath) === target
      && JSON.stringify(this.service.getKeys(sourcePath)) === JSON.stringify(keys);
    if (keys.length === 0 || !isCurrent()) {
      return;
    }
    // Core may copy the source frontmatter too; reconcile it before offering a transfer.
    await this.service.reconcile([targetPath]);
    await this.service.deletePath(sourcePath);
    const snapshot = JSON.stringify(keys.map((key) => this.service.lookup(key)));
    if (
      isCurrent() && await confirm({
        app: this.app,
        cancelButtonText: 'Keep deleted keys',
        message: `The note ${sourcePath} was merged into ${targetPath}. Move its permanent keys (${keys.join(', ')}) to the merged note so existing external links keep working?`,
        okButtonText: 'Move keys',
        title: 'Preserve permanent links?'
      }) && isCurrent() && snapshot === JSON.stringify(keys.map((key) => this.service.lookup(key)))
    ) {
      await this.service.moveKeys(sourcePath, targetPath);
    }
  }
}
