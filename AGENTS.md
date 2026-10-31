# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Filing an issue (for AI agents and humans)

Open issues through the [issue forms](https://github.com/mnaoumov/obsidian-permanent-links/issues/new/choose), not as blank issues.

Filing from the CLI or the API (`gh issue create --body`, or an AI agent filing for you) skips the form, and `gh issue create --template` cannot load an issue form. In that case, open the matching form in [`.github/ISSUE_TEMPLATE/`](https://github.com/mnaoumov/obsidian-permanent-links/tree/HEAD/.github/ISSUE_TEMPLATE), copy every field as a `### <label>` heading in the form's order, and fill in each one. Always state the plugin version, the Obsidian version and your operating system.

## Overview

`Permanent Links` gives a note or an attachment a permanent key, **only when asked**, and opens it from an `obsidian://` link that carries the key, wherever the file has moved since.

A path is an address, not an identity. It changes when a note moves, is renamed, or grows into a folder (`charlie.md` to `charlie/index.md`). Obsidian rewrites every link inside the vault when that happens, so inside the vault nothing breaks. What it cannot rewrite is every reference from outside: links from another vault, `obsidian://open?file=...` links in bookmarks, messages and emails, paths quoted in other tools and in git history. A key is for those references. A file nobody outside the vault refers to never needs one, so the plugin never keys every file.

What already exists, so the plugin does not rebuild it:

- **`Advanced URI`** (`obsidian-advanced-uri`) resolves `obsidian://adv-uri?uid=...` against a frontmatter field (`idField`, a string or a list), and can generate a UUID into it. Notes only, no attachments; the lookup scans the metadata cache; no conflict handling, no record of deleted files, no warning when a key is edited by hand.
- **`Note UID Generator`** and **`Add an ID to the front matter`** (`guid-front-matter`) write ids into frontmatter, the second one for every note. Neither resolves a link.
- **Core** has `obsidian://open?vault=...&file=<path>`, which is exactly the path-based link this plugin replaces, and block ids (`^abc`), which are unique per note and ASCII-only.

## Current state

The repo was generated on 2026-10-25 with `create-obsidian-plugin` (preset `all-in-one`, CSS, desktop and mobile, the unofficial API subset, no editor extensions). Its answers are in `.create-obsidian-plugin.json`, so re-running the generator in this folder updates every file not edited by hand.

The key service, commands and URI resolver are implemented. `src/keys/` owns Unicode validation, random generation, the in-memory key map, serialized mutations and link resolution. `src/plugin.ts` wires storage, frontmatter, metadata, rename, delete and create events, the three file commands, a global deleted-key management command, the protocol handler and the versioned API. Commands use `obsidian-lib`'s command handlers; file commands also provide file context menus. `api.d.ts` is the self-contained read/assign/transfer API contract, version `1.1.0`, published under `permanent-links`; it resolves live files and returns `null` for unknown or deleted files. Calls before startup reconciliation finishes report that the vault is not ready. `moveKeys(fromFile, toFile)` transfers all aliases, preserving the destination's primary key, and clears a live source's frontmatter with its acceptance receipt. Attachments and deleted sources are supported. Callers await completion before deleting a live source; the method moves identities, not content. Frontmatter writes precede store changes; if clearing the source fails, the destination is restored before rejecting. These separate file writes are not a crash-atomic transaction.

Startup reconciliation runs after layout readiness. It registers the configured property with `Advanced Metadata Cache` through API contract `^1.4.0` and waits for `getPathsWithPropertySafe`, then reads only those candidate notes and the Markdown paths already in `keys.json`. Including stored paths detects keys removed while Obsidian was closed. An absent or incompatible provider, a disabled Properties module, or an API failure falls back to one metadata-cache walk through the vault's Markdown files. An empty index is a complete answer. The safe lookup includes AMC's startup rebuild; the optimization reduces this plugin's reconciliation work, not the provider's own rebuild. Subsequent metadata changes reconcile the changed note only. Mutations run in a queue; failures propagate to their caller without poisoning the queue, and identical snapshots are not written again. `keys.json` is a readable JSON array of `{ key, path, deletedAt?, forwardVault? }` records, with normalized identities held in a map for lookup. Notes use the configurable `keyPropertyName` list (default `keys`); changing the setting requires a reload and does not migrate the old property. Attachments use the store alone. File and folder renames update mapped paths. Observed deletions keep the last path and an ISO timestamp; returning files revive their keys, including attachments. Missing startup paths remain reserved without an invented deletion time. Resolving one offers explicit removed-file or missing-folder choices and cancellation. The first missing ancestor covers the whole missing subtree. Moved-file and moved-folder answers select a registered vault or a native folder picker, trusting the answer without searching the destination. Missing subtree entries and aliases store a forwarding vault, including corrected tombstones. The triggering URI forwards immediately with its other parameters and a four-hop bound; a persistent Copy new link notice remains. Unregistered or ambiguous destinations and unavailable native capabilities use Copy instead. Desktop folder selection attempts vault-open(path, false); mobile selection never writes another vault. Attachments require Set key in the destination or its opt-in unique-name fallback. Native desktop URI dispatch and mobile parser/reload paths have regression coverage. A newly opened desktop vault may require its normal trust/setup before a replacement link is used.

Copy permanent link reuses the first key or generates one; Set key adds an alias, preserving prior links; Remove key selects an alias when needed and asks before removing it. List and purge deleted keys shows keys, last paths and deletion times, and confirms each purge. The resolver opens the current file, reports unknown and deleted keys, and supports heading and block targets. Resolve unique file names is off by default; when enabled, unknown keys can match a case-insensitive NFC-normalized basename without its extension. Ambiguous names list every candidate and open nothing. Stored keys always take precedence over name fallback, and Copy permanent link always assigns a stored identity. The store refuses malformed data without overwriting it. Duplicate ownership stays with the previously mapped file during reconciliation. Duplicate claims are removed from the copy with a notice naming both files. Removing an existing identity through frontmatter opens the three-choice dialog; Enter and closing revert, invalid edits restore the previous keys, and stale answers are discarded. Plugin writes are suppressed during reconciliation. Accepted lists travel atomically in the companion `<keyPropertyName>-accepted` property so sync does not repeat a decision. Startup imports existing notes without dialogs; unkeyed notes remain untouched. See `demo-vault/03 Key conflicts.md` for the receipt contract. Core `Note Composer` merges are observed through its typed `mergeFile(target, source, mode)` method. After a successful merge deletes a keyed source, a confirmation offers to transfer every alias while preserving the target primary key. Cancelling or closing keeps the tombstones; rejected merges offer nothing. Answers are discarded after core disable, plugin unload, source recreation, target removal or source identity changes. The patch follows core enable/disable through the shared lifecycle components. The demo vault still contains generated sample content, to be replaced when the full feature set is ready. Unit coverage is enforced at 100%; behavioral command and resolver tests live alongside the key implementation. Duplicate repair, all manual-edit choices and core merge regressions pass on public and catalyst desktop. Every `src/keys` cross-platform file, including cross-vault forwarding and core merges, passes on Android serially. The integration harness is 17.7.4, which caps its emulator at `BULK_CORES` itself.

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
- **A file may hold several keys; a key points to exactly one file.** On a merge, the merged-away note's keys move to the target as extra keys, so links to it keep working. A merging plugin can call the API to do it; for core `Note Composer`, a successful merge that deletes a keyed source offers to move all its keys to the target. Cancelling keeps the deleted-key records.
- **A deleted keyed file leaves a tombstone** in the store, so the link can say "deleted" rather than "unknown key".
- **A key edited by hand** in the frontmatter (`A` becomes `B`) opens a dialog: *You changed the key from A to B. Every external link to A stops working.* with **Revert to A** (the default: Enter or closing the dialog reverts, so an accidental edit never breaks a link), **Keep B, redirect A** (keeps `B` and stores `A` as an extra key of the same file), and **Keep B**.

### Lookups and `Advanced Metadata Cache`

The store answers key to path with one map lookup and needs no walk of the vault. At startup, `src/keys/startup-note-paths.ts` asks the optional `Advanced Metadata Cache` property index for the notes carrying the configured key property, after registering it and waiting for a current answer. The key service combines these paths with previously stored Markdown paths, then reconciles frontmatter. Without a usable index, it walks the metadata cache once. `src/keys/startup.desktop-performance.integration.test.ts` compares both paths in a real 37,000-note vault; see CONTRIBUTING.md for the command and measurement boundaries.

### API

A hand-written, self-contained root `api.d.ts`, published through the plugin registry under the id `permanent-links`: get a file's keys, resolve a key to a file or a tombstone, assign a generated key, add a key, move keys from one file to another (for merges).
