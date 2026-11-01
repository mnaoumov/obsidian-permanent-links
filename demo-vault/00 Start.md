# Start here

This is an [Obsidian](https://obsidian.md/) vault that documents the [Permanent Links](https://github.com/mnaoumov/obsidian-permanent-links/) plugin by demonstrating it. Every feature has a note that says what it does and why you would want it, and a button you can press to watch it happen.

A path is an address, not an identity. When a note moves, is renamed or grows into a folder, Obsidian updates every link inside the vault, but it cannot update the links that live outside it: `obsidian://open?file=...` links in bookmarks, messages, emails, task trackers and other vaults. `Permanent Links` gives a note or an attachment a permanent key, only when you ask for one, and a link that carries the key keeps opening the file wherever it has moved.

## Your first minute

Below this paragraph is a **code button** — a captioned rectangle. It is not a picture of a button: **clicking it runs the code**, and the result appears underneath it. The `</>` toggle beside the caption reveals the code it runs, so nothing here is a black box.

```code-button
---
caption: Copy and open the permanent link of Project plan
---
await require('/demoSetup.ts').copyAndOpenProjectPlanLink(app);
```

The button ran **`Permanent Links`: Copy permanent link** on [Project plan](<./Materials/01 Permanent links/Project plan.md>), showed the copied `obsidian://permanent-links?vault=...&key=project-plan` link in a notice, came back to this note, and opened the link. `Project plan` opened, found by its key rather than by its path.

Every button in this vault also states its **manual equivalent**, so you learn the real steps rather than depending on the buttons. Here, the manual equivalent is to open the note, run **`Permanent Links`: Copy permanent link** from the Command Palette (`Ctrl+P` / `Cmd+P`), and paste the link into a browser's address bar.

## Features

| Note                                                              | What it covers                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [01 Permanent links](<./01 Permanent links.md>)                   | Copying and opening a link, readable keys, removing a key, and attachments.  |
| [02 Moved and deleted files](<./02 Moved and deleted files.md>)   | A link that follows a moved note, and what it says about a deleted one.      |
| [03 Key conflicts](<./03 Key conflicts.md>)                       | Duplicate repair, the safe choices when a key changes, and merged notes.     |
| [04 Moving between vaults](<./04 Moving between vaults.md>)       | Trusted move answers, forwarding and attachment handoff.                     |
| [05 Settings](<./05 Settings.md>)                                 | Every setting, by the key it is stored under in `data.json`.                 |

## Materials

`Materials/` holds the notes and the attachment the walkthroughs operate on, so you never have to build a fixture to see a feature working.
