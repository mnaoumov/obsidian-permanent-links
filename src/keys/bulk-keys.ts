/**
 * Keys many files at once: the folder command, and the opt-in automatic keying at startup and on create.
 */

const MAX_FAILED_PATHS_SHOWN = 3;

interface KeyFilesParams {
  readonly assignKey: (path: string) => Promise<unknown>;
  readonly fileExists: (path: string) => boolean;
  readonly hasKeys: (path: string) => boolean;
  readonly paths: readonly string[];
}

interface KeyFilesResult {
  readonly failedPaths: readonly string[];
  readonly keyedCount: number;
}

/**
 * The notice text for a finished keying pass.
 *
 * @param result - The pass result.
 * @param scope - Where the pass ran, such as `folder Notes` or `the vault`.
 * @returns The notice text.
 */
export function formatKeyFilesResult(result: KeyFilesResult, scope: string): string {
  const keyed = `Gave permanent keys to ${String(result.keyedCount)} ${result.keyedCount === 1 ? 'file' : 'files'} in ${scope}.`;
  if (result.failedPaths.length === 0) {
    return keyed;
  }
  const shown = result.failedPaths.slice(0, MAX_FAILED_PATHS_SHOWN).join(', ');
  const hiddenCount = result.failedPaths.length - MAX_FAILED_PATHS_SHOWN;
  const more = hiddenCount > 0 ? ` and ${String(hiddenCount)} more` : '';
  return `${keyed} Could not key ${String(result.failedPaths.length)}: ${shown}${more}. See the console for the errors.`;
}

/**
 * Whether a vault path lies inside a folder, at any depth. The vault root contains every path.
 *
 * @param path - The vault path of a file.
 * @param folderPath - The vault path of the folder; `/` or an empty string is the vault root.
 * @returns Whether the file is inside the folder.
 */
export function isInFolder(path: string, folderPath: string): boolean {
  return folderPath === '/' || folderPath === '' || path.startsWith(`${folderPath}/`);
}

/**
 * Gives a generated key to every listed file that has none, one file at a time, in the given order.
 *
 * A file that is gone by its turn is skipped. A file whose key cannot be written is recorded and the rest
 * are still keyed, so one malformed note does not stop the pass.
 *
 * @param params - The files and the key service operations.
 * @returns How many files were keyed and which ones failed.
 */
export async function keyFiles(params: KeyFilesParams): Promise<KeyFilesResult> {
  const failedPaths: string[] = [];
  let keyedCount = 0;
  for (const path of params.paths) {
    if (!params.fileExists(path) || params.hasKeys(path)) {
      continue;
    }
    try {
      await params.assignKey(path);
      keyedCount++;
    } catch (error) {
      console.error(`Could not give a permanent key to ${path}`, error);
      failedPaths.push(path);
    }
  }
  return { failedPaths, keyedCount };
}
