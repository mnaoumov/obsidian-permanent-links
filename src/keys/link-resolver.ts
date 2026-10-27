import type { ObsidianProtocolData } from 'obsidian';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import {
  keyIdentity,
  normalizeKey
} from './key.ts';

interface LinkResolverConstructorParams {
  readonly fileExists: (path: string) => boolean;
  readonly getFilePaths: () => readonly string[];
  readonly getVaultName: () => string;
  readonly lookup: (key: string) => ResolverEntry | undefined;
  readonly missing: (path: string) => Promise<void>;
  readonly notice: (message: string) => void;
  readonly open: (path: string, params: Partial<ObsidianProtocolData>) => Promise<void>;
  readonly shouldUseFileName: () => boolean;
}

interface ResolverEntry {
  readonly deletedAt?: string;
  readonly path: string;
}

export class LinkResolver {
  private readonly params: LinkResolverConstructorParams;

  public constructor(params: LinkResolverConstructorParams) {
    this.params = params;
  }

  public async resolve(query: Partial<ObsidianProtocolData>): Promise<void> {
    if (query['vault'] && query['vault'] !== this.params.getVaultName()) {
      return;
    }
    const key = query['key'];
    if (!key) {
      this.params.notice('The permanent link has no key.');
      return;
    }
    try {
      normalizeKey(key);
    } catch {
      this.params.notice(`Invalid permanent key: ${key}`);
      return;
    }
    const entry = this.params.lookup(key);
    if (entry) {
      if (this.params.fileExists(entry.path)) {
        await this.params.open(entry.path, query);
      } else if (entry.deletedAt) {
        this.params.notice(`File with key ${key} was deleted on ${entry.deletedAt}. Last known location: ${entry.path}`);
      } else {
        await this.params.missing(entry.path);
      }
      return;
    }
    const matches = this.params.shouldUseFileName()
      ? this.params.getFilePaths().filter((path) => {
        const name = path.slice(path.lastIndexOf('/') + 1);
        const dot = name.lastIndexOf('.');
        const basename = dot > 0 ? name.slice(0, dot) : name;
        return basename.normalize('NFC').toLowerCase().normalize('NFC') === keyIdentity(key);
      })
      : [];
    if (matches.length === 1) {
      await this.params.open(ensureNonNullable(matches[0]), query);
    } else if (matches.length > 1) {
      this.params.notice(`The name ${key} is not unique:\n${matches.join('\n')}`);
    } else {
      this.params.notice(`Unknown permanent key: ${key}`);
    }
  }
}
