import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  expect,
  it
} from 'vitest';

import type { PermanentLinksApi } from '../../api.d.ts';

interface Measurement {
  readonly cacheReads: number;
  readonly elapsedMilliseconds: number;
  readonly isIndexed: boolean;
  readonly walks: number;
}

interface PropertyIndexApi {
  readonly getPathsWithPropertySafe: (propertyName: string) => Promise<null | string[]>;
  readonly registerPropertyName: (propertyName: string) => void;
}

it('reconciles the same identities with the property index and a full walk on 37000 notes', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { findPluginApi, waitUntil } }) {
      const TIMEOUT_IN_MILLISECONDS = 30_000;
      const ROUNDS = 6;
      const amc = findPluginApi<PropertyIndexApi>({ apiVersionRange: '^1.4.0', pluginId: 'advanced-metadata-cache' });
      if (!amc) {
        throw new Error('Advanced Metadata Cache property API is unavailable');
      }
      const indexStart = performance.now();
      amc.registerPropertyName('keys');
      const candidates = await amc.getPathsWithPropertySafe('keys');
      const indexReadyMilliseconds = performance.now() - indexStart;
      const measurements: Measurement[] = [];
      let expectedStore: null | string = null;
      let areStoresEqual = true;
      for (let round = 0; round < ROUNDS; round++) {
        // Alternate the order to reduce warm-cache and machine-load bias.
        for (const isIndexed of round % 2 === 0 ? [true, false] : [false, true]) {
          await app.plugins.disablePlugin('permanent-links');
          if (isIndexed) {
            await app.plugins.enablePlugin('advanced-metadata-cache');
            const current = findPluginApi<PropertyIndexApi>({ apiVersionRange: '^1.4.0', pluginId: 'advanced-metadata-cache' });
            if (!current) {
              throw new Error('Advanced Metadata Cache did not publish its API');
            }
            current.registerPropertyName('keys');
            await current.getPathsWithPropertySafe('keys');
          } else {
            await app.plugins.disablePlugin('advanced-metadata-cache');
          }
          let walks = 0;
          let cacheReads = 0;
          const originalWalk = app.vault.getMarkdownFiles;
          const originalRead = app.metadataCache.getFileCache;
          app.vault.getMarkdownFiles = function getMarkdownFiles(): ReturnType<typeof originalWalk> {
            walks++;
            return originalWalk.call(this);
          };
          app.metadataCache.getFileCache = function getFileCache(file): ReturnType<typeof originalRead> {
            cacheReads++;
            return originalRead.call(this, file);
          };
          const start = performance.now();
          try {
            await app.plugins.enablePlugin('permanent-links');
            await waitUntil({
              message: 'Permanent Links startup reconciliation',
              predicate: (): boolean => {
                try {
                  const api = findPluginApi<PermanentLinksApi>({ apiVersionRange: '^1.1.0', pluginId: 'permanent-links' });
                  return api?.resolve('identity-99')?.path === 'alpha-99.md';
                } catch {
                  return false;
                }
              },
              timeoutInMilliseconds: TIMEOUT_IN_MILLISECONDS
            });
            measurements.push({ cacheReads, elapsedMilliseconds: performance.now() - start, isIndexed, walks });
          } finally {
            Object.assign(app.vault, { getMarkdownFiles: originalWalk });
            Object.assign(app.metadataCache, { getFileCache: originalRead });
          }
          const store = canonicalizeStore(await app.vault.adapter.read(`${app.vault.configDir}/plugins/permanent-links/keys.json`));
          expectedStore ??= store;
          areStoresEqual &&= store === expectedStore;
        }
      }
      return { areStoresEqual, candidateCount: candidates?.length, indexReadyMilliseconds, measurements, noteCount: app.vault.getMarkdownFiles().length };

      function canonicalizeStore(text: string): string {
        const entries: unknown = JSON.parse(text);
        if (!Array.isArray(entries)) {
          throw new TypeError('Expected key records');
        }
        const records: readonly unknown[] = entries;
        // Candidate iteration order is not part of the identity contract.
        return JSON.stringify(records.map((entry) => JSON.stringify(entry)).sort());
      }
    },
    vaultPath: getTemporaryVault().path
  });
  console.warn(JSON.stringify(result));
  expect(result.noteCount).toBe(37_000);
  expect(result.candidateCount).toBe(100);
  expect(result.areStoresEqual).toBe(true);
  expect(result.measurements.filter((entry) => entry.isIndexed).every((entry) => entry.walks === 0 && entry.cacheReads < result.noteCount)).toBe(true);
  expect(result.measurements.filter((entry) => !entry.isIndexed).every((entry) => entry.walks === 1 && entry.cacheReads >= result.noteCount)).toBe(true);
});
