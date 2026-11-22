/*
 * The redirector base URL is adapted from `Vault Permalink Kit` (https://github.com/Convex-Works/vault-permalink-kit),
 * its "Public share base URL" setting and `buildShareUrl`.
 *
 * MIT License
 *
 * Copyright (c) 2024 Convex Works
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * The protocol link the plugin registers, up to and including the `?` of its query.
 */
export const PROTOCOL_LINK_PREFIX = 'obsidian://permanent-links?';

/**
 * An absolute `http` or `https` URL with a host, no whitespace and no `#` fragment.
 */
const HTTP_BASE_URL_PATTERN = /^https?:\/\/[^\s#/?]+[^\s#]*$/iu;

interface BuildPermanentLinkParams {
  readonly key: string;
  /**
   * A base URL of a redirector the user hosts, or an empty string for the `obsidian://` link itself.
   * It must pass {@link isValidRedirectorBaseUrl}.
   */
  readonly redirectorBaseUrl: string;
  readonly vault: string;
}

/**
 * Builds the link Copy permanent link copies.
 *
 * Without a redirector it is `obsidian://permanent-links?vault=<vault>&key=<key>`. With one it is
 * `<base>?vault=<vault>&key=<key>`, appended with `&` when the base already has a query, so a chat app or an
 * email client that refuses custom schemes still makes it clickable. The redirector must send the browser on
 * to `obsidian://permanent-links` with every query parameter it received.
 *
 * @param params - The vault, the key and the redirector base URL.
 * @returns The link.
 */
export function buildPermanentLink(params: BuildPermanentLinkParams): string {
  const query = `vault=${encodeURIComponent(params.vault)}&key=${encodeURIComponent(params.key)}`;
  const base = params.redirectorBaseUrl.trim();
  if (!base) {
    return PROTOCOL_LINK_PREFIX + query;
  }

  if (base.endsWith('?') || base.endsWith('&')) {
    return base + query;
  }

  const separator = base.includes('?') ? '&' : '?';
  return base + separator + query;
}

/**
 * Tells whether a redirector base URL can carry the link's query: an absolute `http` or `https` URL without a
 * `#` fragment, since anything after a `#` never reaches the redirector.
 *
 * @param value - The base URL as typed in the settings.
 * @returns `true` when the base URL is usable, or is empty, which means no redirector.
 */
export function isValidRedirectorBaseUrl(value: string): boolean {
  const base = value.trim();
  return !base || HTTP_BASE_URL_PATTERN.test(base);
}
