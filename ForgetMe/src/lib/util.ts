import browser from 'webextension-polyfill';

export type FilterLegacy = {
	domain: string;
	removeHistory?: boolean;
	removeCookies?: boolean;
	removeStorage?: boolean;
	removeCache?: boolean;
	enabled?: boolean; // legacy support
}

export type Filter = Omit<FilterLegacy, 'enabled'>

export type Global = Omit<Filter, 'domain'>

export const DEFAULT_FILTER: Readonly<Filter> = Object.freeze({
	domain: '',
	removeHistory: false,
	removeCookies: false,
	removeStorage: false,
	removeCache: false,
});

export const DEFAULT_GLOBAL: Readonly<Global> = Object.freeze({
	removeHistory: false,
	removeCookies: false,
	removeStorage: false,
	removeCache: false,
});

export const STORAGE_KEYS: readonly ['global', 'filters'] = Object.freeze(['global', 'filters']);


/*==================================================
	Is browser ready
==================================================*/
export function isBrowserReady(): boolean {
	return !!(browser && browser.storage && browser.storage.local && browser.tabs && browser.history && browser.browsingData);
}