// Cspell:words openmode
import {
  expect,
  it,
  vi
} from 'vitest';

import { KeyForwarder } from './key-forwarder.ts';

it('preserves query parameters, forwards immediately and retains a fresh copyable link', async () => {
  const open = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
  const notice = vi.fn();
  const forwarder = new KeyForwarder({ listVaultNames: (): string[] => ['Other vault'], notice, open });
  await forwarder.forward('Other vault', { action: 'permanent-links', custom: 'value', heading: 'A & B', key: '文字', openmode: 'tab', vault: 'Source' });
  const dispatched = new URL(open.mock.calls[0]?.[0] ?? '');
  expect(dispatched.searchParams.get('vault')).toBe('Other vault');
  expect(dispatched.searchParams.get('key')).toBe('文字');
  expect(dispatched.searchParams.get('heading')).toBe('A & B');
  expect(dispatched.searchParams.get('openmode')).toBe('tab');
  expect(dispatched.searchParams.get('custom')).toBe('value');
  expect(dispatched.searchParams.get('permanent-links-hops')).toBe('1');
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('Other vault'), expect.not.stringContaining('permanent-links-hops'));
});

it('shows Copy without dispatch for unregistered, ambiguous or looping destinations and dispatch failures', async () => {
  const open = vi.fn<(url: string) => Promise<void>>().mockRejectedValue(new Error('Unavailable'));
  const notice = vi.fn();
  const listVaultNames = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);
  const forwarder = new KeyForwarder({ listVaultNames, notice, open });
  await forwarder.forward('Other', { key: 'key' });
  expect(open).not.toHaveBeenCalled();
  expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('not registered'), expect.stringContaining('vault=Other'));
  listVaultNames.mockResolvedValue(['Other', 'Other']);
  await forwarder.forward('Other', { key: 'key' });
  expect(open).not.toHaveBeenCalled();
  for (const hops of ['4', '-1', 'broken', '1.5', '999999999999999999999']) {
    listVaultNames.mockResolvedValue(['Other']);
    await forwarder.forward('Other', { 'key': 'key', 'permanent-links-hops': hops });
    expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('stopped'), expect.any(String));
  }
  expect(open).not.toHaveBeenCalled();
  await forwarder.forward('Other', { 'key': 'key', 'permanent-links-hops': '2' });
  expect(open).toHaveBeenCalledTimes(1);
  expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('could not open'), expect.any(String));
  listVaultNames.mockRejectedValue(new Error('Registry unavailable'));
  await forwarder.forward('Other', { key: 'key' });
  expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('could not open'), expect.any(String));
  await forwarder.forward('Other', {});
  expect(notice).toHaveBeenLastCalledWith(expect.stringContaining('File with key '), expect.any(String));
});
