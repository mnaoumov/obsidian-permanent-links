import type { KeyFormat } from './keys/key.ts';

export class PluginSettings {
  public keyFormat: KeyFormat = 'short';
  public keyPropertyName = 'keys';
  public redirectorBaseUrl = '';
  public shouldKeyFilesAutomatically = false;
  public shouldMirrorKeysToAliases = false;
  public shouldResolveUniqueFileNames = false;
}
