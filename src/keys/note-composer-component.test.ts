import type { CorePluginToggleComponentConstructorParams } from '@mnaoumov/obsidian-lib/components/core-plugin-toggle-component';
import type {
  App,
  TFile
} from 'obsidian';
import type { Mock } from 'vitest';

import { confirm } from '@mnaoumov/obsidian-lib/modals/confirm';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { Component } from 'obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import { KeyService } from './key-service.ts';
import { NoteComposerComponent } from './note-composer-component.ts';

interface Composer {
  readonly mergeFile: (target: TFile, source: TFile, mode?: 'append' | 'prepend') => Promise<void>;
}
interface Context {
  readonly component: NoteComposerComponent;
  readonly composer: Composer;
  readonly files: Map<string, TFile>;
  readonly original: Mock<(target: TFile, source: TFile) => Promise<void>>;
  readonly service: KeyService;
  readonly source: TFile;
  readonly target: TFile;
  readonly unavailable: () => void;
}
const state = vi.hoisted(() => ({ toggle: undefined as CorePluginToggleComponentConstructorParams | undefined }));
vi.mock('@mnaoumov/obsidian-lib/components/core-plugin-toggle-component', () => ({
  CorePluginToggleComponent: class extends Component {
    public constructor(params: CorePluginToggleComponentConstructorParams) {
      super();
      state.toggle = params;
    }

    public override onload(): void {
      invokeAsyncSafely(async () => {
        await state.toggle?.onEnable?.();
      });
    }

    public override onunload(): void {
      invokeAsyncSafely(async () => {
        await state.toggle?.onDisable?.();
      });
    }
  }
}));
vi.mock('@mnaoumov/obsidian-lib/modals/confirm', () => ({ confirm: vi.fn(() => Promise.resolve(false)) }));

afterEach(() => vi.clearAllMocks());

async function setup(): Promise<Context> {
  const source = castTo<TFile>({ path: 'source.md' });
  const target = castTo<TFile>({ path: 'target.md' });
  const files = new Map([['source.md', source], ['target.md', target]]);
  const service = new KeyService({
    fileExists: (path): boolean => files.has(path),
    getNotePaths: (): string[] => [],
    notice: noop,
    readNoteKeys: (): string[] => [],
    readNoteReceipt: (): string[] => [],
    readStore: (): Promise<null> => Promise.resolve(null),
    resolveKeyEdit: (): Promise<'revert'> => Promise.resolve('revert'),
    writeNoteKeys: noopAsync,
    writeStore: noopAsync
  });
  await service.load();
  await service.addKey(source.path, 'source');
  await service.addKey(source.path, 'alias');
  await service.addKey(target.path, 'primary');
  const original = vi.fn((targetFile: TFile, sourceFile: TFile): Promise<void> => {
    expect(targetFile).toBe(target);
    files.delete(sourceFile.path);
    return noopAsync();
  });
  const composer = { mergeFile: original };
  let isAvailable = true;
  const app = castTo<App>({
    internalPlugins: { getPluginById: () => isAvailable ? { instance: composer } : undefined },
    vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null, getFileByPath: (path: string) => files.get(path) ?? null }
  });
  const component = new NoteComposerComponent(app, service);
  component.load();
  return {
    component,
    composer,
    files,
    original,
    service,
    source,
    target,
    unavailable: (): void => {
      isAvailable = false;
    }
  };
}

it('transfers all aliases after success and preserves the exact core promise and target primary', async () => {
  const context = await setup();
  vi.mocked(confirm).mockResolvedValue(true);
  const result = context.composer.mergeFile(context.target, context.source, 'prepend');
  expect(context.original).toHaveBeenCalledWith(context.target, context.source, 'prepend');
  expect(context.original.mock.contexts[0]).toBe(context.composer);
  expect(result).toBe(context.original.mock.results[0]?.value);
  await result;
  await vi.waitFor(() => {
    expect(context.service.getKeys('target.md')).toEqual(['primary', 'source', 'alias']);
  });
  expect(context.service.getKeys('source.md')).toEqual([]);
  context.component.unload();
});

it('keeps tombstones on cancel and preserves a core rejection without offering', async () => {
  const context = await setup();
  vi.mocked(confirm).mockResolvedValue(false);
  await context.composer.mergeFile(context.target, context.source);
  await vi.waitFor(() => {
    expect(confirm).toHaveBeenCalledOnce();
  });
  expect(context.service.lookup('source')?.deletedAt).toBeDefined();
  context.original.mockRejectedValueOnce(new Error('merge failed'));
  await expect(context.composer.mergeFile(context.target, context.source)).rejects.toThrow('merge failed');
  expect(confirm).toHaveBeenCalledOnce();
  context.component.unload();
});

it.each(['unload', 'disable', 'recreate', 'target', 'keys', 'record'])('discards a stale %s answer', async (reason) => {
  const context = await setup();
  let answer: ((isAccepted: boolean) => void) | undefined;
  vi.mocked(confirm).mockImplementation(() =>
    new Promise<boolean>((resolve) => {
      answer = resolve;
    })
  );
  await context.composer.mergeFile(context.target, context.source);
  await vi.waitFor(() => {
    expect(answer).toBeDefined();
  });
  switch (reason) {
    case 'disable': {
      await state.toggle?.onDisable?.();
      break;
    }
    case 'keys': {
      await context.service.purgeTombstones(['alias']);
      break;
    }
    case 'recreate': {
      context.files.set('source.md', context.source);
      break;
    }
    case 'target': {
      context.files.delete('target.md');
      break;
    }
    case 'unload': {
      context.component.unload();
      break;
    }
    default: {
      await context.service.forwardPath('source.md', 'Elsewhere');
    }
  }
  answer?.(true);
  await vi.waitFor(() => {
    expect(confirm).toHaveResolved();
  });
  expect(context.service.getKeys('target.md')).toEqual(['primary']);
  context.component.unload();
});

it('does not offer for a source not deleted, and handles an unavailable core instance', async () => {
  const context = await setup();
  context.original.mockImplementation(noopAsync);
  await context.composer.mergeFile(context.target, context.source);
  await vi.waitFor(() => {
    expect(context.original).toHaveResolved();
  });
  expect(confirm).not.toHaveBeenCalled();
  await state.toggle?.onDisable?.();
  await state.toggle?.onDisable?.();
  context.unavailable();
  await state.toggle?.onEnable?.();
  context.component.unload();
});

it('does not offer for an unkeyed source or an operation completing after unload', async () => {
  const context = await setup();
  await context.service.removeKey('source.md', 'source');
  await context.service.removeKey('source.md', 'alias');
  await context.composer.mergeFile(context.target, context.source);
  await vi.waitFor(() => {
    expect(context.original).toHaveResolved();
  });
  expect(confirm).not.toHaveBeenCalled();
  context.files.set('source.md', context.source);
  await context.service.addKey('source.md', 'new');
  let finish: (() => void) | undefined;
  context.original.mockImplementation(() =>
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  const pending = context.composer.mergeFile(context.target, context.source);
  context.files.delete('source.md');
  context.component.unload();
  finish?.();
  await pending;
  expect(confirm).not.toHaveBeenCalled();
});
