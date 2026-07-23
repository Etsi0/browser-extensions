import type { RemovalFlags, SiteRule } from '../types/common';

export const DEFAULT_REMOVALS: Readonly<RemovalFlags> = Object.freeze({
	removeCookies:      false,
	removeDownloads:    false,
	removeHistory:      false,
	removeIndexedDB:    false,
	removeLocalStorage: false,
} as const);

export const DEFAULT_SITE_RULE: Readonly<SiteRule> = Object.freeze({
	pattern: '',
	...DEFAULT_REMOVALS,
} as const);

export const STORAGE_KEY = 'settings' as const;
export const LEGACY_STORAGE_KEYS = Object.freeze(['global', 'filters'] as const);

export const REMOVAL_LABELS = Object.freeze({
	removeCookies:      'cookies',
	removeDownloads:    'downloads',
	removeHistory:      'history',
	removeIndexedDB:    'indexedDB',
	removeLocalStorage: 'local storage',
} as const);

export type RemovalKey = keyof typeof REMOVAL_LABELS;

export const REMOVAL_KEYS = Object.freeze(
	Object.keys(REMOVAL_LABELS) as RemovalKey[],
);
