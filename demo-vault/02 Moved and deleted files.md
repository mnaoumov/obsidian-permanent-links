# Moved and deleted files

A permanent link is worth having because of what happens to files later: they move, they are renamed, they grow into folders, and some are deleted. This note shows the link through each of those.

## A moved note

[Travel log](<./Materials/02 Moved and deleted files/Travel log.md>) carries the key `travel-log`. The first button moves it into a folder of its own, as `Trips/Travel log/index.md`: a new folder, a new name and a new depth at once. The second opens its permanent link.

```code-button
---
caption: Move Travel log into a folder
---
await require('/demoSetup.ts').moveTravelLog(app);
```

```code-button
---
caption: Open the permanent link of Travel log
---
await require('/demoSetup.ts').openTravelLogLink(app);
```

The link opens the note at its new path. An `obsidian://open?file=...` link to the old path would now open nothing. Renames and moves are followed for attachments as well, and for every keyed file inside a renamed folder.

```code-button
---
caption: Move Travel log back
---
await require('/demoSetup.ts').moveTravelLogBack(app);
```

Manual equivalent: move or rename the note in the File explorer, then paste its permanent link into a browser's address bar.

## A deleted note

A deleted keyed file leaves a deleted-key record behind, so its link can say that the file was deleted, when, and where it last was, rather than calling the key unknown. The record also keeps the key reserved, so no other file can take it by accident.

```code-button
---
caption: Delete Old draft
---
await require('/demoSetup.ts').deleteOldDraft(app);
```

```code-button
---
caption: Open the permanent link of Old draft
---
await require('/demoSetup.ts').openOldDraftLink(app);
```

The notice names the deleted file's last path and the time of deletion. Its **Correct location** button is for a file that was not deleted after all but moved to another vault, which [04 Moving between vaults](<./04 Moving between vaults.md>) covers.

Manual equivalent: delete [Old draft](<./Materials/02 Moved and deleted files/Old draft.md>) in the File explorer, then open its permanent link.

## List and purge deleted keys

**`Permanent Links`: List and purge deleted keys** lists every deleted key with its last path and deletion time. Choosing one asks before forgetting it for good: old links then report an unknown key, and the key can be assigned again.

```code-button
---
caption: List the deleted keys
---
require('/demoSetup.ts').listDeletedKeys(app);
```

Manual equivalent: run **`Permanent Links`: List and purge deleted keys** from the Command Palette.

## A restored note

A file that comes back at its last path gets its keys back, attachments included, and its link opens it again.

```code-button
---
caption: Restore Old draft
---
await require('/demoSetup.ts').restoreOldDraft(app);
```

Manual equivalent: restore the note from the trash, or recreate it at the same path.

A keyed file that disappears while Obsidian is closed has no deletion time. Its link asks what happened instead: **I removed file ...**, **I moved file ... to another vault**, or **I don't know**, which changes nothing.
