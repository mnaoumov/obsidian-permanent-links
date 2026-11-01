# Moving between vaults

A permanent key keeps a link working when a file moves inside its vault. When a file moves to another vault, `Permanent Links` can remember your answer and forward old links to the destination.

## Try a permanent link

This button opens the [move example](<./Materials/04 Moving between vaults/Move example.md>) and runs Copy permanent link. Its key is already present in frontmatter, so you can move the note to a second vault with `Permanent Links` enabled and try the old link.

```code-button
---
caption: Copy the move example's permanent link
---
await app.workspace.openLinkText('Materials/04 Moving between vaults/Move example.md', '', false);
app.commands.executeCommandById('permanent-links:copy-permanent-link');
```

Manual equivalent: open the example note and run **`Permanent Links`: Copy permanent link** from the Command Palette.

## Tell the old vault where it went

Open the old link. If the file was missing at startup, choose **I moved file ... to another vault**. When its containing folder is missing too, **I moved folder ... to another vault** applies your answer to every missing keyed file below that folder, including aliases. Cancel or choose **I don't know** to change nothing.

If Obsidian observed the disappearance while running, the link initially shows a deletion notice with its last path and observation time. Choose **Correct location** to identify it as a move instead.

Choose a registered vault, or use the native folder selector to choose another vault's root folder. You never need to type a vault name. On desktop, choosing a folder also asks Obsidian to register that existing vault. These internal capabilities are guarded; when registration or opening is unavailable, the notice retains **Copy new link**. If Obsidian asks you to trust a newly opened vault, complete its normal setup and use the replacement link again.

Your answer is trusted. The plugin does not search the destination, inspect its key store, or confirm that the file exists there. It saves the forwarding vault in the old vault's readable `keys.json`, then immediately forwards the link. Heading, block, opening mode and other query parameters travel with it. Automatic forwarding stops after four hops to bound loops. The copied replacement link starts a fresh hop count.

Vault registrations belong to each device. On a device where the destination is unregistered or its name is ambiguous, the plugin shows the replacement link and **Copy new link**. Register the vault there before using the replacement link.

## Notes and attachments

A moved note carries its frontmatter keys into the destination. An attachment carries no frontmatter: in the destination vault, run **Set key** on the attachment with its original key. Alternatively, the destination's optional **Resolve unique file names** setting can resolve that key when it equals the attachment's unique basename. Forwarding never writes into the other vault's store.

A file restored to its original path revives its local identity and clears that forwarding entry.
