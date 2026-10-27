import { GlobalCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/global-command-handler';

export class TombstoneCommandHandler extends GlobalCommandHandler {
  private readonly action: () => Promise<void>;

  public constructor(action: () => Promise<void>) {
    super({ icon: 'trash', id: 'manage-deleted-keys', name: 'List and purge deleted keys' });
    this.action = action;
  }

  protected override execute(): Promise<void> {
    return this.action();
  }
}
