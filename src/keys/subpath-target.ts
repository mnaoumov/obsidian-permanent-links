import type {
  CachedMetadata,
  Pos
} from 'obsidian';

/**
 * The characters of a generated block id.
 */
const BLOCK_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The length of a generated block id, the same as Obsidian's own generated block ids.
 */
const BLOCK_ID_LENGTH = 6;

/**
 * Block kinds whose id goes at the end of their last line. Every other block takes it on a line of its own,
 * after a blank line, because a trailing `^id` there would become part of the table, quote, code or math.
 */
const INLINE_ID_SECTION_TYPES = new Set(['list', 'paragraph']);

/**
 * What a heading-or-block link points at, and the edit that gives a block its id when it has none.
 */
export type SubpathTarget = BlockTarget | HeadingTarget;

interface BlockTarget {
  readonly blockId: string;
  /**
   * The text to insert at {@link insertOffset} to add the id, or `null` when the block already has one.
   */
  readonly insertion: null | string;
  readonly insertOffset: number;
  readonly kind: 'block';
}

interface FindSubpathTargetParams {
  readonly cache: CachedMetadata | null;
  readonly generateBlockId: () => string;
  readonly line: number;
}

interface HeadingTarget {
  readonly heading: string;
  readonly kind: 'heading';
}

/**
 * Finds the heading or block on a line of a note.
 *
 * A heading line gives the heading. Any other line gives the innermost list item or section containing it,
 * with its existing block id when it has one. A block without one gets a new id: at the end of the last line
 * of a paragraph or list item, and on a line of its own after any other block.
 *
 * @param params - The note's cached metadata, the cursor line and the id generator.
 * @returns The target, or `null` when the line holds no heading or block, such as a blank line or the
 * frontmatter.
 */
export function findSubpathTarget(params: FindSubpathTargetParams): null | SubpathTarget {
  const { cache, line } = params;
  const heading = cache?.headings?.find((value) => value.position.start.line === line);
  if (heading) {
    return { heading: heading.heading, kind: 'heading' };
  }

  const section = cache?.sections?.find((value) => containsLine(value.position, line));
  if (!section || section.type === 'yaml' || section.type === 'heading') {
    return null;
  }

  let position = section.position;
  if (section.type === 'list') {
    // The innermost item is the last one containing the line, since nested items follow their parent.
    for (const listItem of cache?.listItems ?? []) {
      if (containsLine(listItem.position, line)) {
        position = listItem.position;
      }
    }
  }
  const blocks = Object.values(cache?.blocks ?? {});
  const existing = blocks.find((value) => value.position.start.line === position.start.line);
  if (existing) {
    return { blockId: existing.id, insertion: null, insertOffset: position.end.offset, kind: 'block' };
  }

  const usedIds = new Set(blocks.map((value) => value.id.toLowerCase()));
  let blockId = params.generateBlockId();
  while (usedIds.has(blockId)) {
    blockId = params.generateBlockId();
  }
  const insertion = INLINE_ID_SECTION_TYPES.has(section.type) ? ` ^${blockId}` : `\n\n^${blockId}`;
  return { blockId, insertion, insertOffset: position.end.offset, kind: 'block' };
}

/**
 * Generates a block id: six random characters from `a-z0-9`.
 *
 * @returns The block id.
 */
export function generateBlockId(): string {
  const values = window.crypto.getRandomValues(new Uint8Array(BLOCK_ID_LENGTH));
  return Array.from(values, (value) => BLOCK_ID_ALPHABET.charAt(value % BLOCK_ID_ALPHABET.length)).join('');
}

function containsLine(position: Pos, line: number): boolean {
  return position.start.line <= line && line <= position.end.line;
}
