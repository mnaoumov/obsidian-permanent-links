import type { SettingDefinitionItem } from 'obsidian';

import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

/**
 * The settings tab is declarative: return one definition per row from `getSettingDefinitionItems()` and
 * Obsidian renders them. `bind` wires a component to a settings property in both directions, so there is
 * no read/write plumbing to maintain.
 */
export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: 'Frontmatter list used for note keys. Changing this does not migrate existing properties. Reload the plugin after changing it.',
        name: 'Key property name',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'keyPropertyName', valueComponent: text });
          });
        }
      }),
      this.settingEx({
        desc: 'When a key is unknown, open a file with that unique name (without its extension). Ambiguous names never open a file.',
        name: 'Resolve unique file names',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'shouldResolveUniqueFileNames', valueComponent: toggle });
          });
        }
      })
    ];
  }
}
