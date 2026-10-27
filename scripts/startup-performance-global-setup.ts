import type { PopulateFilesParams } from 'obsidian-integration-testing';

import {
  getIntegrationTestPluginPopulate,
  OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID
} from '@mnaoumov/obsidian-dev-toolkit/test-runners/integration-test-plugin';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

const NOTE_COUNT = 37_000;
const KEYED_NOTE_COUNT = 100;

function populate(): PopulateFilesParams {
  const buildPath = process.env['PERMANENT_LINKS_AMC_BUILD_PATH'];
  if (!buildPath) {
    throw new Error('Set PERMANENT_LINKS_AMC_BUILD_PATH to an Advanced Metadata Cache dist/build folder.');
  }
  const pluginFolder = '.obsidian/plugins/advanced-metadata-cache';
  const files: PopulateFilesParams = {
    ...getIntegrationTestPluginPopulate(),
    [`${pluginFolder}/data.json`]: JSON.stringify({ isBacklinksModuleEnabled: false }),
    [`${pluginFolder}/main.js`]: readFileSync(join(buildPath, 'main.js')),
    [`${pluginFolder}/manifest.json`]: readFileSync(join(buildPath, 'manifest.json'))
  };
  for (let index = 0; index < NOTE_COUNT; index++) {
    files[`alpha-${String(index)}.md`] = index < KEYED_NOTE_COUNT
      ? `---\nkeys:\n  - identity-${String(index)}\nkeys-accepted:\n  - identity-${String(index)}\n---\nNote ${String(index)}\n`
      : `Note ${String(index)}\n`;
  }
  return files;
}

const { setup, teardown } = createSetup({ enableCommunityPlugins: [OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID, 'advanced-metadata-cache'], populate });

export {
  setup,
  teardown
};
