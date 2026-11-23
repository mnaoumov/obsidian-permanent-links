# CHANGELOG

## 1.1.0

This release has 4 new features, 1 fix and 6 documentation changes. 9 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- (Toggleable) Automatic Permanent-Linking (#1)
- copy permanent links of several files selected in the File explorer
- copy a permanent link to the heading or block at the cursor
- add an opt-in redirector base URL for copied permanent links

### Fixed

- load again after an update or Hot Reload instead of failing on an already published API

### Documentation

- refresh the See also section
- restore the README badge line
- use the plugin badge line in the README
- point the install section at the community directory listing
- record the current integration harness version
- link the changelog now that 1.0.0 is released

## 1.0.0

First release of `Permanent Links`: give a note or an attachment a permanent key when you ask for one, and open it through a link that keeps working wherever the file moves.

- **Copy permanent link** gives the active file a generated key if it has none (12 letters and digits, or a GUID without hyphens) and copies an `obsidian://permanent-links` link to it. The link can point at a heading or a block.
- **Set key** adds a readable key in any script as an alias, so older links keep working. **Remove key** asks before it removes one.
- Attachments get keys too. They are kept in the plugin's readable `keys.json`, because an attachment has no frontmatter.
- Moves, renames and deletions are followed. A moved file's link opens it at its new path, and a deleted file's link says when the file was deleted and where it last was. A restored file gets its keys back. **List and purge deleted keys** manages these records.
- Conflicts are repaired safely. A copied note loses the duplicate key, and a key edited by hand opens a dialog whose default keeps old links working. A core `Note Composer` merge offers to move the merged note's keys to the target.
- Moving to another vault: tell the old vault where a file went, and its old links forward there.
- Optional settings: mirror note keys into `aliases` for the Quick Switcher and link suggestions, and open an unknown key by a unique file name.
- An API for other plugins (`api.d.ts`, contract version 1.1.0) reads, resolves, assigns and moves keys.
- Startup uses the `Advanced Metadata Cache` property index when it is available.
- A demo vault ships with the release, with an **Open demo vault** command and a **Report a bug** command.
