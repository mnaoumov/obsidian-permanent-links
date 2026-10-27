import type { TFile } from 'obsidian';

/**
Contract version 1.0.0, published under plugin id `permanent-links`.
*/
export interface PermanentLinksApi {
  /**
  Adds an alias without removing existing keys. Rejects invalid or occupied keys.
  */
  addKey: (file: TFile, key: string) => Promise<void>;
  /**
  Reuses the first key or assigns a random twelve-character key.
  */
  assignKey: (file: TFile) => Promise<string>;
  /**
  Returns a copy of the file's keys, in primary-key order.
  */
  getKeys: (file: TFile) => readonly string[];
  /**
  Resolves a live key; unknown or deleted files return `null`.
  */
  resolve: (key: string) => null | TFile;
}
