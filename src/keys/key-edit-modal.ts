import type { PromiseResolve } from '@mnaoumov/typescript-lib/async';
import type { App } from 'obsidian';

import {
  ModalBase,
  showModal
} from '@mnaoumov/obsidian-lib/modals/modal';

type KeyEditChoice = 'keep' | 'redirect' | 'revert';

class KeyEditModal extends ModalBase<KeyEditChoice> {
  private choice: KeyEditChoice = 'revert';
  private readonly next: readonly string[];
  private readonly path: string;
  private readonly previous: readonly string[];

  public constructor(app: App, path: string, previous: readonly string[], next: readonly string[], resolve: PromiseResolve<KeyEditChoice>) {
    super({ app, cssClasses: ['permanent-links-key-edit'], promiseResolve: resolve });
    this.path = path;
    this.previous = previous;
    this.next = next;
  }

  public override onClose(): void {
    this.promiseResolve(this.choice);
  }

  public override onOpen(): void {
    this.setTitle('Permanent key changed');
    this.contentEl.createEl('p', { text: `You changed the key from ${this.previous.join(', ')} to ${this.next.join(', ') || '(none)'}. Every external link to ${this.previous.join(', ')} stops working if its key is removed.` });
    this.contentEl.createEl('p', { text: this.path });
    const buttons = this.contentEl.createDiv('modal-button-container');
    const choices: readonly [KeyEditChoice, string][] = [
      ['revert', 'Revert to A'],
      ['redirect', 'Keep B, redirect A'],
      ['keep', 'Keep B']
    ];
    for (const [choice, text] of choices) {
      const button = buttons.createEl('button', { attr: { 'data-choice': choice }, text });
      button.addEventListener('click', () => {
        this.choice = choice;
        this.close();
      });
      if (choice === 'revert') {
        button.focus();
      }
    }
    this.scope.register([], 'Enter', () => {
      this.close();
      return false;
    });
  }
}

export function resolveKeyEdit(app: App, path: string, previous: readonly string[], next: readonly string[]): Promise<KeyEditChoice> {
  return showModal((resolve) => new KeyEditModal(app, path, previous, next, resolve));
}
