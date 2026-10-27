import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';

import {
  generateKey,
  keyIdentity,
  normalizeKey
} from './key.ts';

interface KeyEntry {
  readonly deletedAt?: string;
  readonly key: string;
  readonly path: string;
}

interface KeyServiceConstructorParams {
  readonly fileExists: (path: string) => boolean;
  readonly getNotePaths: () => readonly string[];
  readonly readNoteKeys: (path: string) => unknown;
  readonly readStore: () => Promise<unknown>;
  readonly writeNoteKeys: (path: string, keys: readonly string[]) => Promise<void>;
  readonly writeStore: (entries: readonly KeyEntry[]) => Promise<void>;
}

/**
Vault-wide identity and serialized changes; frontmatter is authoritative for notes.
*/
export class KeyService {
  private readonly entries = new Map<string, KeyEntry>();
  private readonly params: KeyServiceConstructorParams;
  private pending: Promise<void> = noopAsync();
  private savedSnapshot?: string;

  public constructor(params: KeyServiceConstructorParams) {
    this.params = params;
  }

  public addKey(path: string, key: string): Promise<void> {
    return this.enqueue(() => this.addKeyImpl(path, key));
  }

  public assignKey(path: string): Promise<string> {
    return this.enqueue(async () => {
      this.requireFile(path);
      const existing = this.getKeys(path)[0];
      if (existing !== undefined) {
        await this.save();
        return existing;
      }
      let key: string;
      do {
        key = generateKey();
      } while (this.entries.has(keyIdentity(key)));
      await this.addKeyImpl(path, key);
      return key;
    });
  }

  public deletePath(path: string): Promise<void> {
    return this.enqueue(async () => {
      const deletedAt = new Date().toISOString();
      for (const [identity, entry] of this.entries) {
        if (this.matchesPath(entry.path, path) && !entry.deletedAt && !this.params.fileExists(entry.path)) {
          this.entries.set(identity, { ...entry, deletedAt });
        }
      }
      await this.save();
    });
  }

  public getKeys(path: string): string[] {
    return [...this.entries.values()].filter((entry) => entry.path === path).map((entry) => entry.key);
  }

  public listTombstones(): KeyEntry[] {
    return [...this.entries.values()].filter((entry) => entry.deletedAt && !this.params.fileExists(entry.path)).map((entry) => ({ ...entry }));
  }

  public async load(): Promise<void> {
    const raw = await this.params.readStore();
    if (raw !== null) {
      if (!Array.isArray(raw)) {
        throw new TypeError('Invalid keys.json: expected a list of keys and paths.');
      }
      const entries: unknown[] = raw;
      for (const entry of entries) {
        if (
          typeof entry !== 'object' || entry === null || !('key' in entry) || !('path' in entry)
          || typeof entry.key !== 'string' || typeof entry.path !== 'string'
        ) {
          throw new Error('Invalid keys.json entry.');
        }
        const key = normalizeKey(entry.key);
        const identity = keyIdentity(key);
        if (this.entries.has(identity)) {
          throw new Error(`Duplicate key in keys.json: ${key}`);
        }
        const parsed: KeyEntry = { key, path: entry.path };
        if ('deletedAt' in entry) {
          if (typeof entry.deletedAt !== 'string' || !Number.isFinite(Date.parse(entry.deletedAt))) {
            throw new TypeError('Invalid keys.json deletion time.');
          }
          Object.assign(parsed, { deletedAt: entry.deletedAt });
        }
        this.entries.set(identity, parsed);
      }
    }
    this.reviveEntries('');
    await this.reconcile();
  }

  public lookup(key: string): KeyEntry | undefined {
    const entry = this.entries.get(keyIdentity(key));
    return entry ? { ...entry } : undefined;
  }

  public purgeTombstones(keys: readonly string[]): Promise<void> {
    return this.enqueue(async () => {
      for (const key of keys) {
        const identity = keyIdentity(key);
        const entry = this.entries.get(identity);
        if (entry?.deletedAt && !this.params.fileExists(entry.path)) {
          this.entries.delete(identity);
        }
      }
      await this.save();
    });
  }

  public reconcile(notePaths?: readonly string[]): Promise<void> {
    return this.enqueue(async () => {
      const paths = notePaths ?? this.params.getNotePaths();
      const noteKeys = new Map(paths.map((path) => [path, this.parseNoteKeys(this.params.readNoteKeys(path))]));
      // Keep the mapped owner when duplicates appear. Conflict repair belongs to the conflict UI.
      for (const [identity, entry] of this.entries) {
        const keys = noteKeys.get(entry.path);
        if (keys?.every((key) => keyIdentity(key) !== identity)) {
          this.entries.delete(identity);
        }
      }
      for (const [path, keys] of noteKeys) {
        for (const key of keys) {
          const identity = keyIdentity(key);
          const existing = this.entries.get(identity);
          if (!existing || existing.path === path || !this.params.fileExists(existing.path)) {
            this.entries.set(identity, { key, path });
          }
        }
      }
      await this.save();
    });
  }

  public removeKey(path: string, key: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireFile(path);
      const identity = keyIdentity(key);
      if (this.entries.get(identity)?.path !== path) {
        return;
      }
      const keys = this.getKeys(path).filter((value) => keyIdentity(value) !== identity);
      await this.writeNote(path, keys);
      this.entries.delete(identity);
      await this.save();
    });
  }

  public rename(oldPath: string, newPath: string): Promise<void> {
    return this.enqueue(async () => {
      for (const [identity, entry] of this.entries) {
        if (entry.path === oldPath || entry.path.startsWith(`${oldPath}/`)) {
          this.entries.set(identity, { ...entry, path: newPath + entry.path.slice(oldPath.length) });
        }
      }
      await this.save();
    });
  }

  public resolve(key: string): KeyEntry | undefined {
    const entry = this.entries.get(keyIdentity(key));
    return entry && !entry.deletedAt && this.params.fileExists(entry.path) ? { ...entry } : undefined;
  }

  public revivePath(path: string): Promise<void> {
    return this.enqueue(async () => {
      this.reviveEntries(path);
      await this.save();
    });
  }

  public validateKey(path: string, key: string): string {
    const normalized = normalizeKey(key);
    const existing = this.entries.get(keyIdentity(normalized));
    if (existing && existing.path !== path) {
      throw new Error(`Key “${existing.key}” already belongs to ${existing.path}.`);
    }
    return normalized;
  }

  private async addKeyImpl(path: string, key: string): Promise<void> {
    this.requireFile(path);
    const normalized = this.validateKey(path, key);
    const identity = keyIdentity(normalized);
    if (this.entries.has(identity)) {
      await this.save();
      return;
    }
    const keys = this.getKeys(path);
    keys.push(normalized);
    await this.writeNote(path, keys);
    this.entries.set(identity, { key: normalized, path });
    await this.save();
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(action);
    this.pending = result.then(noop).catch(noop);
    return result;
  }

  private matchesPath(candidate: string, path: string): boolean {
    return path === '' || candidate === path || candidate.startsWith(`${path}/`);
  }

  private parseNoteKeys(value: unknown): string[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value) || !value.every((key): key is string => typeof key === 'string')) {
      throw new Error('The key property must be a list of strings.');
    }
    return value.map((key) => normalizeKey(key));
  }

  private requireFile(path: string): void {
    if (!this.params.fileExists(path)) {
      throw new Error(`File no longer exists: ${path}`);
    }
  }

  private reviveEntries(path: string): void {
    for (const [identity, entry] of this.entries) {
      if (this.matchesPath(entry.path, path) && this.params.fileExists(entry.path)) {
        this.entries.set(identity, { key: entry.key, path: entry.path });
      }
    }
  }

  private async save(): Promise<void> {
    const entries = [...this.entries.values()];
    const snapshot = JSON.stringify(entries);
    if (snapshot === this.savedSnapshot) {
      return;
    }
    await this.params.writeStore(entries);
    this.savedSnapshot = snapshot;
  }

  private async writeNote(path: string, keys: readonly string[]): Promise<void> {
    if (path.endsWith('.md')) {
      await this.params.writeNoteKeys(path, keys);
    }
  }
}
