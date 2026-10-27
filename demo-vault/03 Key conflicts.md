# Key conflicts and manual edits

When a copied note claims another file's key, `Permanent Links` keeps the mapped owner, removes the duplicate claim from the copy, and shows a notice naming both files. Other keys, properties and the note body are preserved. A copy receives a generated key only when requested.

## Try it

The supplied [Keyed note](<./Materials/03 Key conflicts/Keyed note.md>) already carries `demo-conflict-original`. Open this vault with the plugin enabled, then copy it with this button. The copy opens and a notice names the owner and the copy; the original key remains on the original note.

```code-button
---
caption: Copy the keyed note and repair the duplicate
---
await require('/demoSetup.ts').copyKeyedNote(app);
```

Manual equivalent: duplicate `Materials/03 Key conflicts/Keyed note.md` in the File explorer, then inspect the copy's properties. Its duplicate key is removed automatically. Delete the copy after exploring.

To try the warning, open the original note in Source mode and change its `keys` list to `demo-conflict-changed`, leaving `keys-accepted` alone. Choose one of the three actions below. Revert lets you repeat the same edit; after Keep, change the current key again to try another choice.

## Manual edit choices

Changing or removing an existing key in frontmatter opens a warning with three choices:

1. **Revert to A** restores the previous keys. Pressing Enter or closing the dialog also reverts.
2. **Keep B, redirect A** accepts the new keys and retains the removed keys as aliases, preserving existing links.
3. **Keep B** accepts the new keys and removes the previous identities. Links to removed keys stop working.

Adding a first key or another alias needs no warning. Case-only changes and Unicode normalization preserve identity. An invalid change to an already keyed note restores its previous keys and shows a notice. Invalid keys on a previously unkeyed note are reported without overwriting the note. If a note changes again while the dialog is open, the old answer is discarded and the newer metadata change is reconciled separately.

## Accepted changes across devices

The plugin writes an acceptance receipt beside the keys: a list named `keys-accepted` with the default configuration, or `<keyPropertyName>-accepted` with a custom property. It updates the keys and receipt in the same frontmatter operation. Keep this property when syncing or copying notes.

A manual edit to `keys` leaves the receipt unchanged, so removing an existing identity triggers the warning. An accepted change arriving through sync carries matching keys and receipt, so another device does not ask again. Duplicate ownership is checked independently, including when a copied note contains a receipt.

The receipt records acceptance, rather than providing access control. Editing both properties to the same value explicitly declares the change accepted. A sync snapshot arriving before anyone has accepted it still requires a decision.

At startup, existing notes are imported without a manual-edit dialog and keyed notes receive a receipt when needed. Changes made while the plugin was disabled are therefore accepted on startup. Untouched notes with no keys receive no new property. After an accepted removal of every key, the empty receipt remains to carry that decision to other devices.
