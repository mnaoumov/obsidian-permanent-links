import type { App } from 'obsidian';

import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';

/**
The consumed subset of `Advanced Metadata Cache`'s self-contained API, contract `1.4.0`.
*/
interface PropertyIndexApi {
  getPathsWithPropertySafe: (propertyName: string) => Promise<null | string[]>;
  registerPropertyName: (propertyName: string) => void;
}

export async function getStartupNotePaths(app: App, propertyName: string): Promise<string[]> {
  try {
    const api = findPluginApi<PropertyIndexApi>({ apiVersionRange: '^1.4.0', pluginId: 'advanced-metadata-cache' });
    if (api) {
      api.registerPropertyName(propertyName);
      const paths = await api.getPathsWithPropertySafe(propertyName);
      if (paths !== null) {
        return paths;
      }
    }
  } catch {
    // The optional provider can unload or fail during startup; frontmatter remains authoritative.
  }
  return app.vault.getMarkdownFiles().map((file) => file.path);
}
