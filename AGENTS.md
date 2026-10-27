# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Overview

`Permanent Links` gives a note or an attachment a permanent key, **only when asked**, and opens it from an `obsidian://` link that carries the key, wherever the file has moved since.

A path is an address, not an identity. It changes when a note moves, is renamed, or grows into a folder (`charlie.md` to `charlie/index.md`). Obsidian rewrites every link inside the vault when that happens, so inside the vault nothing breaks. What it cannot rewrite is every reference from outside: links from another vault, `obsidian://open?file=...` links in bookmarks, messages and emails, paths quoted in other tools and in git history. A key is for those references. A file nobody outside the vault refers to never needs one, so the plugin never keys every file.

What already exists, so the plugin does not rebuild it:

- **`Advanced URI`** (`obsidian-advanced-uri`) resolves `obsidian://adv-uri?uid=...` against a frontmatter field (`idField`, a string or a list), and can generate a UUID into it. Notes only, no attachments; the lookup scans the metadata cache; no conflict handling, no record of deleted files, no warning when a key is edited by hand.
- **`Note UID Generator`** and **`Add an ID to the front matter`** (`guid-front-matter`) write ids into frontmatter, the second one for every note. Neither resolves a link.
- **Core** has `obsidian://open?vault=...&file=<path>`, which is exactly the path-based link this plugin replaces, and block ids (`^abc`), which are unique per note and ASCII-only.

## Current state

The repo was generated on 2026-10-25 with `create-obsidian-plugin` (preset `all-in-one`, CSS, desktop and mobile, the unofficial API subset, no editor extensions). Its answers are in `.create-obsidian-plugin.json`, so re-running the generator in this folder updates every file not edited by hand.

The key service, commands and URI resolver are implemented. `src/keys/` owns Unicode validation, random generation, the in-memory key map, serialized mutations and link resolution. `src/plugin.ts` wires storage, frontmatter, metadata, rename, delete and create events, the three file commands, a global deleted-key management command, the protocol handler and the versioned API. Commands use `obsidian-lib`'s command handlers; file commands also provide file context menus. `api.d.ts` is the self-contained read/assign API contract, version `1.0.0`, published under `permanent-links`; it resolves live files and returns `null` for unknown or deleted files. Calls before startup reconciliation finishes report that the vault is not ready.

Startup reconciliation runs after layout readiness, walking the metadata cache through the vault's Markdown files. Subsequent metadata changes reconcile the changed note only. Mutations run in a queue; failures propagate to their caller without poisoning the queue, and identical snapshots are not written again. `keys.json` is a readable JSON array of `{ key, path, deletedAt? }` records, with normalized identities held in a map for lookup. Notes use the configurable `keyPropertyName` list (default `keys`); changing the setting requires a reload and does not migrate the old property. Attachments use the store alone. File and folder renames update mapped paths. Observed deletions keep the last path and an ISO timestamp; returning files revive their keys, including attachments. Missing startup paths remain reserved without an invented deletion time. Resolving one offers explicit removed-file or missing-folder choices and cancellation. The first missing ancestor covers the whole missing subtree. Cross-vault move choices and forwarding remain a design target.

Copy permanent link reuses the first key or generates one; Set key adds an alias, preserving prior links; Remove key selects an alias when needed and asks before removing it. List and purge deleted keys shows keys, last paths and deletion times, and confirms each purge. The resolver opens the current file, reports unknown and deleted keys, and supports heading and block targets. Resolve unique file names is off by default; when enabled, unknown keys can match a case-insensitive NFC-normalized basename without its extension. Ambiguous names list every candidate and open nothing. Stored keys always take precedence over name fallback, and Copy permanent link always assigns a stored identity. The store refuses malformed data without overwriting it. Duplicate ownership stays with the previously mapped file during reconciliation. Duplicate repair, the hand-edit dialog, merge handling and optional metadata-index acceleration described below remain design targets. The demo vault still contains generated sample content, to be replaced when the full feature set is ready. Unit coverage is enforced at 100%; behavioral command and resolver tests live alongside the key implementation. Desktop tests pass; Android verification awaits the harness startup fix recorded in the central task store.

## Design

### Where a key lives

**Stored data is readable without tools; only resolving it needs the plugin.** A key is a plain string that a text search finds.

- **A note** keeps its keys in a frontmatter list property, `keys` by default (setting `keyPropertyName`). The key travels with the note: copied out of the vault, synced, or read by another tool, it is still there.
- **An attachment** cannot carry frontmatter, so its keys live only in the key store.
- **The key store** is one JSON file, `keys.json` in the plugin's folder, separate from `data.json` so that settings sync does not reload it on every change. It maps every key to the path of its file, for notes as well as attachments, and keeps tombstones. For a note it is a mirror of the frontmatter, rebuilt from it when the two disagree; for an attachment it is the only record.
- **Not the file's inode.** An inode survives a move on one disk, but a clone, a sync, a restore or another device gives the file a new one; editors that save atomically change it on every save; a freed inode is reused; FAT and exFAT have none; mobile cannot read it; and nobody can see it without a tool. It is at most a local cache hint.

### What a key looks like

- **Generated:** 12 random characters from `a-z0-9`, the same shape as a generated attachment name.
- **Typed by the user**, like a readable block id: letters and digits of any script (`\p{L}`, `\p{M}`, `\p{N}`), `-` and `_`, 1 to 64 characters, normalized to NFC. Not ASCII-only. Rejected: spaces, `/`, `#`, `^`, `|`, `[`, `]`, and anything a URI or a wikilink would need to escape beyond percent-encoding.
- **Unique per vault**, compared case-insensitively after NFC normalization, so `Charlie` and `charlie` cannot both exist. A link carries the vault name as well, so the same key in two vaults never opens the wrong file.
- **An attachment's key** is generated independently of its filename, just like a note's. Ordinary names such as `report.pdf` and `Screenshot 2026-10-25.png` need no naming convention. A user who wants a filename as a readable key can use Set key explicitly.

### Commands and the link

- **Copy permanent link**: for the active file, or a file's context menu in the File explorer. Assigns a generated key if the file has none, then copies `obsidian://permanent-links?vault=<vault>&key=<key>`.
- **Set key**: a prompt to type a readable key, validated as above.
- **Remove key**: asks first, because external links stop working.
- **The link** is registered with `registerObsidianProtocolHandler('permanent-links', ...)`. A live key opens its file. A key with a tombstone says the file was deleted, when, and the path it last had. An unknown key says so.

### Conflicts, merges, deletes and edits

- **A duplicated note** carries the original's key in its frontmatter. The file the store already maps keeps the key; the key is removed from the copy, with a notice naming both files. A copy gets a key of its own only when asked.
- **A file may hold several keys; a key points to exactly one file.** On a merge, the merged-away note's keys move to the target as extra keys, so links to it keep working. A merging plugin can call the API to do it; for core `Note Composer`, the delete of a keyed note straight after its content was merged into another is detected, and the user is offered to move the key.
- **A deleted keyed file leaves a tombstone** in the store, so the link can say "deleted" rather than "unknown key".
- **A key edited by hand** in the frontmatter (`A` becomes `B`) opens a dialog: *You changed the key from A to B. Every external link to A stops working.* with **Revert to A** (the default: Enter or closing the dialog reverts, so an accidental edit never breaks a link), **Keep B, redirect A** (keeps `B` and stores `A` as an extra key of the same file), and **Keep B**.

### Lookups and `Advanced Metadata Cache`

The store answers key to path with one map lookup and needs no walk of the vault. Keeping it in step with the notes' frontmatter at startup is the only expensive step, and that is where `Advanced Metadata Cache` comes in: when it is installed, its index of paths by property value answers "which notes carry a `keys` property" without a walk; without it, the plugin walks the metadata cache once. The plugin works without it.

### API

A hand-written, self-contained root `api.d.ts`, published through the plugin registry under the id `permanent-links`: get a file's keys, resolve a key to a file or a tombstone, assign a generated key, add a key, move keys from one file to another (for merges).
