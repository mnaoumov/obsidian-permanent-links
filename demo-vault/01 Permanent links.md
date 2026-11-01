# Permanent links

A permanent link looks like `obsidian://permanent-links?vault=<vault>&key=<key>`. It names the file by a key, not by a path, so it keeps working after the file moves. A file gets a key only when you ask for one: `Permanent Links` never keys every file in the vault.

A note keeps its keys in the `keys` frontmatter list, so the key travels with the note and a text search finds it. An attachment cannot carry frontmatter, so its keys live in the plugin's `keys.json`. Every command below works on the active file, and on any file from its context menu in the File explorer.

## Copy permanent link

**`Permanent Links`: Copy permanent link** copies the link of the active file. A file with no key first gets a generated one: 12 random characters from `a-z0-9`. A file that already has keys reuses its first one, its primary key.

```code-button
---
caption: Create New note and copy its permanent link
---
await require('/demoSetup.ts').copyNewNoteLink(app);
```

Open `Materials/01 Permanent links/New note.md` now and its properties show the generated key in `keys`, with the same value in `keys-accepted` ([03 Key conflicts](<./03 Key conflicts.md>) explains that second list).

Manual equivalent: create any note and run **`Permanent Links`: Copy permanent link** from the Command Palette, or right-click the note in the File explorer and choose it from the menu.

`New note` is gitignored, so it stays out of your repository.

## Open a link to a heading or a block

A permanent link opens the file wherever it is. Add `&heading=<heading>` or `&block=<block id>` to land on a part of a note, as an ordinary Obsidian link does.

```code-button
---
caption: Open Project plan at its Budget heading
---
await require('/demoSetup.ts').openProjectPlanHeading(app);
```

```code-button
---
caption: Open Project plan at its deadline block
---
await require('/demoSetup.ts').openProjectPlanBlock(app);
```

Manual equivalent: copy the link of [Project plan](<./Materials/01 Permanent links/Project plan.md>), append `&heading=Budget` or `&block=deadline`, and paste it into a browser's address bar. Add `&openmode=tab` to open the file in a new tab.

A link to a key the vault does not know says so in a notice, rather than opening the wrong file.

## Set key

**`Permanent Links`: Set key** asks for a readable key and adds it to the file as an alias. The keys the file already has keep working, so links already sent out do not break.

```code-button
---
caption: Set a readable key on Project plan
---
await require('/demoSetup.ts').setProjectPlanKey(app);
```

Type `plan-2026` and press Enter, then look at the note's `keys` list: `project-plan` stays first, and `plan-2026` is added after it.

Manual equivalent: open the note and run **`Permanent Links`: Set key**.

A typed key may use letters and digits of any script, `-` and `_`, from 1 to 64 characters. It is unique in the vault, compared without regard to case, so `Plan` and `plan` cannot belong to two files. The prompt explains why a key is refused.

## Remove key

**`Permanent Links`: Remove key** removes one key from the file, after asking, because every link that uses it stops working. A file with several keys asks which one first.

```code-button
---
caption: Remove the key of New note
---
await require('/demoSetup.ts').removeNewNoteKey(app);
```

Manual equivalent: open a keyed note and run **`Permanent Links`: Remove key**.

## Attachments

An attachment gets a key just like a note, but the key lives only in `keys.json`, because an attachment has no frontmatter to hold it. Its key is generated independently of its file name.

```code-button
---
caption: Copy and open the permanent link of floor-plan.svg
---
await require('/demoSetup.ts').copyAndOpenAttachmentLink(app);
```

Manual equivalent: right-click `Materials/01 Permanent links/floor-plan.svg` in the File explorer, choose **Copy permanent link**, and paste the link into a browser's address bar. **Set key** and **Remove key** work on attachments too.
