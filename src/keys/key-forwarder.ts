import type { ObsidianProtocolData } from 'obsidian';

interface KeyForwarderConstructorParams {
  readonly listVaultNames: () => Promise<readonly string[]> | readonly string[];
  readonly notice: (message: string, copyLink: string) => void;
  readonly open: (url: string) => Promise<void> | void;
}

const HOPS_PROPERTY = 'permanent-links-hops';
const MAX_HOPS = 4;

export class KeyForwarder {
  private readonly params: KeyForwarderConstructorParams;

  public constructor(params: KeyForwarderConstructorParams) {
    this.params = params;
  }

  public async forward(vault: string, query: Partial<ObsidianProtocolData>): Promise<void> {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (name !== 'action' && name !== HOPS_PROPERTY && value !== undefined) {
        search.set(name, value);
      }
    }
    search.set('vault', vault);
    const copyLink = `obsidian://permanent-links?${search.toString()}`;
    const prefix = `File with key ${query['key'] ?? ''} moved to vault ${vault}.`;
    const rawHops = query[HOPS_PROPERTY] ?? '0';
    const hops = Number(rawHops);
    if (!/^\d+$/u.test(rawHops) || !Number.isSafeInteger(hops) || hops >= MAX_HOPS) {
      this.params.notice(`${prefix} Automatic forwarding stopped after too many or invalid redirect hops.`, copyLink);
      return;
    }
    try {
      const names = await this.params.listVaultNames();
      if (names.filter((name) => name.toLowerCase() === vault.toLowerCase()).length !== 1) {
        this.params.notice(`${prefix} The destination is not registered uniquely on this device. Copy the new link.`, copyLink);
        return;
      }
      this.params.notice(prefix, copyLink);
      search.set(HOPS_PROPERTY, String(hops + 1));
      await this.params.open(`obsidian://permanent-links?${search.toString()}`);
    } catch {
      this.params.notice(`${prefix} Obsidian could not open the destination on this device. Copy the new link.`, copyLink);
    }
  }
}
