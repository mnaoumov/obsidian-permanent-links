/*
 * The multi-file copy follows "Copy titles+UIDs for selected files" of `Note UID Generator`
 * (https://github.com/Netajam/obsidian_note_uid_generator, 0BSD).
 */

/**
 * One file in a copied link list.
 */
export interface LinkListEntry {
  readonly link: string;
  readonly name: string;
}

const MARKDOWN_TEXT_SPECIAL_CHARACTERS = /[[\\\]]/gu;

/**
 * Formats permanent links of several files as a Markdown list, one `- [name](link)` line per file, in the given
 * order. Brackets and backslashes in a name are escaped, and parentheses in a link are percent-encoded, so every
 * line stays one link whatever the file is called.
 *
 * @param entries - The files' display names and links.
 * @returns The list, without a trailing newline.
 */
export function formatLinkList(entries: readonly LinkListEntry[]): string {
  return entries.map(({ link, name }) => {
    const text = name.replaceAll(MARKDOWN_TEXT_SPECIAL_CHARACTERS, (character) => `\\${character}`);
    const destination = link.replaceAll('(', '%28').replaceAll(')', '%29');
    return `- [${text}](${destination})`;
  }).join('\n');
}
