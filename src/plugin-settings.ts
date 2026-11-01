import type { KeyFormat } from './keys/key.ts';

export class PluginSettings {
  public keyFormat: KeyFormat = 'short';
  public keyPropertyName = 'keys';
  public shouldResolveUniqueFileNames = false;
}
