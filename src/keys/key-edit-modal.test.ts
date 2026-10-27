import type { Modal } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  Modal as ObsidianModal,
  Scope
} from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { resolveKeyEdit } from './key-edit-modal.ts';

// Cspell:words vkey

describe('key edit modal', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['revert', 'redirect', 'keep'])('returns the explicit %s choice', async (choice) => {
    const open = vi.spyOn(ObsidianModal.prototype, 'open').mockImplementation(function openModal(this: Modal): void {
      this.onOpen();
    });
    vi.spyOn(ObsidianModal.prototype, 'close').mockImplementation(function closeModal(this: Modal): void {
      this.onClose();
    });
    const result = resolveKeyEdit(App.createConfigured__().asOriginalType__(), 'note.md', ['A'], ['B']);
    const modal = castTo<Modal>(ensureNonNullable(open.mock.instances[0]));
    expect(modal.contentEl.textContent).toContain('Every external link');
    const button = modal.contentEl.querySelector(`[data-choice="${CSS.escape(choice)}"]`);
    expect(button).toBeInstanceOf(HTMLButtonElement);
    (button as HTMLButtonElement).click();
    expect(await result).toBe(choice);
  });

  it('reverts when closed without choosing, including a complete key removal', async () => {
    const open = vi.spyOn(ObsidianModal.prototype, 'open').mockImplementation(function openModal(this: Modal): void {
      this.onOpen();
    });
    const result = resolveKeyEdit(App.createConfigured__().asOriginalType__(), 'note.md', ['A'], []);
    const modal = castTo<Modal>(ensureNonNullable(open.mock.instances[0]));
    expect(modal.contentEl.textContent).toContain('(none)');
    modal.onClose();
    expect(await result).toBe('revert');
  });

  it('reverts on Enter even when another action has focus', async () => {
    const register = vi.spyOn(Scope.prototype, 'register');
    vi.spyOn(ObsidianModal.prototype, 'open').mockImplementation(function openModal(this: Modal): void {
      this.onOpen();
    });
    vi.spyOn(ObsidianModal.prototype, 'close').mockImplementation(function closeModal(this: Modal): void {
      this.onClose();
    });
    const result = resolveKeyEdit(App.createConfigured__().asOriginalType__(), 'note.md', ['A'], ['B']);
    const handler = ensureNonNullable(register.mock.calls.find((call) => call[1] === 'Enter')?.[2]);
    expect(handler(new KeyboardEvent('keydown'), { key: 'Enter', modifiers: '', vkey: 'Enter' })).toBe(false);
    expect(await result).toBe('revert');
  });
});
