export const ALIASES_PROPERTY = 'aliases';

interface MirrorAliasesParams {
  readonly aliases: unknown;
  readonly keys: readonly string[];
  readonly previousKeys: readonly string[];
}

/**
 * Whether every key already appears in the note's aliases. An `aliases` value the plugin cannot edit counts as
 * mirrored, so reconciliation never retries a write that would change nothing.
 */
export function areKeysMirrored(aliases: unknown, keys: readonly string[]): boolean {
  const list = parseAliases(aliases);
  if (!list) {
    return true;
  }
  const identities = new Set(list.map((alias) => aliasIdentity(alias)));
  return keys.every((key) => identities.has(aliasIdentity(key)));
}

/**
 * The note's aliases with its keys mirrored in: aliases matching a key the plugin wrote before, and no longer a key,
 * are removed; missing keys are appended. Aliases the user wrote are kept. Returns `undefined` when `aliases` is
 * neither a list of strings nor a string, so it is left untouched.
 */
export function mirrorAliases(params: MirrorAliasesParams): string[] | undefined {
  const list = parseAliases(params.aliases);
  if (!list) {
    return undefined;
  }
  const keyIdentities = new Set(params.keys.map((key) => aliasIdentity(key)));
  const removed = new Set(params.previousKeys.map((key) => aliasIdentity(key)).filter((identity) => !keyIdentities.has(identity)));
  const result = list.filter((alias) => !removed.has(aliasIdentity(alias)));
  const present = new Set(result.map((alias) => aliasIdentity(alias)));
  for (const key of params.keys) {
    const identity = aliasIdentity(key);
    if (present.has(identity)) {
      continue;
    }
    result.push(key);
    present.add(identity);
  }
  return result;
}

/**
 * Mirrors the keys about to be written into the frontmatter's aliases. The keys the plugin wrote before are the
 * current key list and its acceptance receipt, so a key removed by hand is still recognized as mirrored.
 */
export function mirrorKeysIntoFrontmatter(frontmatter: Record<string, unknown>, propertyName: string, keys: readonly string[]): void {
  const previousKeys = [frontmatter[propertyName], frontmatter[`${propertyName}-accepted`]]
    .flatMap((value) => Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : []);
  const aliases = mirrorAliases({ aliases: frontmatter[ALIASES_PROPERTY], keys, previousKeys });
  if (aliases?.length === 0) {
    Reflect.deleteProperty(frontmatter, ALIASES_PROPERTY);
  } else if (aliases) {
    Object.defineProperty(frontmatter, ALIASES_PROPERTY, { configurable: true, enumerable: true, value: aliases, writable: true });
  }
}

// Aliases need not be valid keys, so they are compared like keys without validating them.
function aliasIdentity(alias: string): string {
  return alias.normalize('NFC').toLowerCase().normalize('NFC');
}

function parseAliases(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return [value];
  }
  return Array.isArray(value) && value.every((alias): alias is string => typeof alias === 'string') ? [...value] : undefined;
}
