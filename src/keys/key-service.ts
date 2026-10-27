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
  readonly forwardVault?: string;
  readonly key: string;
  readonly path: string;
}

interface KeyServiceConstructorParams {
  readonly fileExists: (path: string) => boolean;
  readonly getNotePaths: () => Promise<readonly string[]> | readonly string[];
  readonly notice: (message: string) => void;
  readonly readNoteKeys: (path: string) => unknown;
  readonly readNoteReceipt: (path: string) => unknown;
  readonly readStore: () => Promise<unknown>;
  readonly resolveKeyEdit: (path: string, previous: readonly string[], next: readonly string[]) => Promise<'keep' | 'redirect' | 'revert'>;
  readonly writeNoteKeys: (path: string, keys: readonly string[]) => Promise<void>;
  readonly writeStore: (entries: readonly KeyEntry[]) => Promise<void>;
}

interface NoteWrite {
  readonly after: string;
  readonly before: string;
}

/**
Vault-wide identity and serialized changes; frontmatter is authoritative for notes.
*/
export class KeyService {
  private readonly entries = new Map<string, KeyEntry>();
  private isLoaded = false;
  private readonly noteWrites = new Map<string, NoteWrite>();
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
        if (this.matchesPath(entry.path, path) && !entry.deletedAt && !entry.forwardVault && !this.params.fileExists(entry.path)) {
          this.entries.set(identity, { ...entry, deletedAt });
        }
      }
      await this.save();
    });
  }

  public forwardPath(path: string, vault: string): Promise<void> {
    return this.enqueue(async () => {
      if (!vault.trim()) {
        throw new Error('Invalid forwarding vault.');
      }
      for (const [identity, entry] of this.entries) {
        if (this.matchesPath(entry.path, path) && !this.params.fileExists(entry.path)) {
          this.entries.set(identity, { forwardVault: vault, key: entry.key, path: entry.path });
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
        if ('forwardVault' in entry) {
          if (typeof entry.forwardVault !== 'string' || !entry.forwardVault.trim()) {
            throw new TypeError('Invalid keys.json forwarding vault.');
          }
          Object.assign(parsed, { forwardVault: entry.forwardVault });
        }
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
    this.isLoaded = true;
  }

  public lookup(key: string): KeyEntry | undefined {
    const entry = this.entries.get(keyIdentity(key));
    return entry ? { ...entry } : undefined;
  }

  public moveKeys(fromPath: string, toPath: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireFile(toPath);
      if (fromPath === toPath) {
        await this.save();
        return;
      }
      const keys = this.getKeys(fromPath);
      if (keys.length === 0) {
        await this.save();
        return;
      }
      const targetKeys = this.getKeys(toPath);
      await this.writeNote(toPath, [...targetKeys, ...keys]);
      try {
        if (this.params.fileExists(fromPath)) {
          await this.writeNote(fromPath, []);
        }
      } catch (error) {
        // Ownership stays with the source unless both frontmatter writes succeed.
        await this.writeNote(toPath, targetKeys);
        throw error;
      }
      // Reinsert in primary-key order so a reload preserves the destination's primary key.
      for (const key of [...targetKeys, ...keys]) {
        this.entries.delete(keyIdentity(key));
      }
      for (const key of [...targetKeys, ...keys]) {
        this.entries.set(keyIdentity(key), { key, path: toPath });
      }
      await this.save();
    });
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
      const paths = notePaths ?? new Set([
        ...await this.params.getNotePaths(),
        // A note may have lost its key property while the vault was closed, so it is absent from the index.
        ...[...this.entries.values()].filter((entry) => entry.path.endsWith('.md')).map((entry) => entry.path)
      ]);
      for (const path of paths) {
        if (!this.params.fileExists(path)) {
          continue;
        }
        const keys = await this.reconcileNote(path);
        if (!keys) {
          continue;
        }
        for (const [identity, entry] of this.entries) {
          if (entry.path === path) {
            this.entries.delete(identity);
          }
        }
        for (const key of keys) {
          const identity = keyIdentity(key);
          this.entries.set(identity, { key, path });
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

  private async chooseNoteKeys(path: string, previous: readonly string[], keys: string[], isAccepted: boolean, raw: unknown): Promise<string[] | undefined> {
    const removed = previous.filter((key) => keys.every((next) => keyIdentity(next) !== keyIdentity(key)));
    if (!this.isLoaded || removed.length === 0 || isAccepted) {
      return keys;
    }
    const choice = await this.params.resolveKeyEdit(path, previous, keys);
    // The user may edit, rename or delete the note while the modal is open.
    if (!this.params.fileExists(path) || JSON.stringify(this.params.readNoteKeys(path)) !== JSON.stringify(raw)) {
      return undefined;
    }
    if (choice === 'revert') {
      return [...previous];
    }
    return choice === 'redirect' ? [...keys, ...removed] : keys;
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(action);
    this.pending = result.then(noop).catch(noop);
    return result;
  }

  private isOwnerReserved(entry: KeyEntry): boolean {
    return this.isLoaded || this.params.fileExists(entry.path);
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

  private async reconcileNote(path: string): Promise<string[] | undefined> {
    const raw = this.params.readNoteKeys(path);
    const snapshot = JSON.stringify([raw]);
    const writing = this.noteWrites.get(path);
    if (writing && (snapshot === writing.after || (writing.after === '[[]]' && raw === undefined))) {
      this.noteWrites.delete(path);
      return this.parseNoteKeys(raw);
    }
    if (snapshot === writing?.before) {
      return undefined;
    }
    this.noteWrites.delete(path);
    const previous = this.getKeys(path);
    let keys: string[];
    try {
      keys = this.parseNoteKeys(raw);
    } catch (error) {
      if (!this.isLoaded || previous.length === 0) {
        throw error;
      }
      await this.writeNote(path, previous);
      this.params.notice(`Invalid permanent keys in ${path}. The previous keys were restored. ${String(error)}`);
      return previous;
    }
    const isAccepted = JSON.stringify(keys) === JSON.stringify(this.params.readNoteReceipt(path));
    const chosen = await this.chooseNoteKeys(path, previous, keys, isAccepted, raw);
    if (!chosen) {
      return undefined;
    }
    const unique = new Map<string, string>();
    for (const key of chosen) {
      const identity = keyIdentity(key);
      const owner = this.entries.get(identity);
      if (owner && owner.path !== path && this.isOwnerReserved(owner)) {
        this.params.notice(`Removed duplicate key “${key}” from ${path}. It belongs to ${owner.path}.`);
      } else {
        unique.set(identity, key);
      }
    }
    const result = [...unique.values()];
    // Do not add coordination metadata to an untouched, unkeyed note.
    if ((raw !== undefined && JSON.stringify(result) !== JSON.stringify(raw)) || (!isAccepted && (result.length > 0 || this.params.readNoteReceipt(path) !== undefined))) {
      await this.writeNote(path, result);
    }
    return result;
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
    if (!path.endsWith('.md')) {
      return;
    }

    const before = JSON.stringify([this.params.readNoteKeys(path)]);
    await this.params.writeNoteKeys(path, keys);
    this.noteWrites.set(path, { after: JSON.stringify([keys]), before });
  }
}
