# Settings

Every setting `Permanent Links` stores, listed by the **key it is written under in `data.json`** rather than by its display label — that is what you see when you open the file, hit a sync conflict, or read a support thread.

Find them in Obsidian under **Settings → Community plugins → `Permanent Links`**.

## General

- `keyFormat`
  - the shape of a key that **Copy permanent link** generates, shown as **Generated key format**. `short` (the default) is 12 random characters from `a-z0-9`; `guid` is a random GUID written without hyphens, 32 lowercase hexadecimal characters such as `3f2a9c0e8b1d4e6fa7c5b2d9e0f1a3b4`. It changes only keys generated from now on: existing keys keep working, and a key you type with **Set key** may take either shape whatever this says.
- `keyPropertyName`
  - the frontmatter list a note keeps its keys in, shown as **Key property name**. Defaults to `keys`. The acceptance receipt beside it is named after it, `<keyPropertyName>-accepted`. Changing it needs a plugin reload, and does not move keys already stored under the old name.
- `shouldMirrorKeysToAliases`
  - shown as **Mirror keys into aliases**, off by default. When it is on, every key of a note is also listed in its `aliases` property, so the Quick Switcher and the link suggestions find the note when you type a key such as `plan-2026`. Choosing the suggestion inserts a link to the note itself; Obsidian does not resolve a bare `[[plan-2026]]` through an alias. Aliases you wrote yourself are never touched: a key the plugin removes (**Remove key**, a duplicate, a move to another note) takes only its own alias with it, and editing `aliases` by hand never changes a key. A keyed note whose alias list lacks one of its keys gets it back the next time the plugin reads the note, so existing notes are filled in on the next plugin load. Turning it off leaves the aliases already added in place.
- `shouldResolveUniqueFileNames`
  - shown as **Resolve unique file names**, off by default. When it is on, a link whose key the vault does not know opens the one file whose name, without its extension, matches the key, compared without regard to case. When several files share that name, the link lists them and opens none. A real key always wins over a file name.

## Try it

The link `obsidian://permanent-links?vault=<vault>&key=floor-plan` names a key nobody assigned. Open it with the setting off and the notice reports an unknown key:

```code-button
---
caption: Open the link key=floor-plan
---
await require('/demoSetup.ts').openFloorPlanByName(app);
```

Turn the setting on, and the same link opens the attachment `floor-plan.svg`, the one file with that name. The change applies live, with no reload.

```code-button
---
caption: Turn shouldResolveUniqueFileNames on
---
await require('/demoSetup.ts').setShouldResolveUniqueFileNames(app, true);
```

```code-button
---
caption: Open the link key=floor-plan again
---
await require('/demoSetup.ts').openFloorPlanByName(app);
```

Manual equivalent: turn on **Resolve unique file names** in the settings tab and open the same link from a browser's address bar.

When you are done, put it back:

```code-button
---
caption: Turn shouldResolveUniqueFileNames off
---
await require('/demoSetup.ts').setShouldResolveUniqueFileNames(app, false);
```

Manual equivalent: turn the toggle off again.

This fallback helps an attachment that moved to another vault without its key: see [04 Moving between vaults](<./04 Moving between vaults.md>).
