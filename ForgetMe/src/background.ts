import browser from 'webextension-polyfill';
import { normalizeRule, parseUrl, tryCatch, urlMatchesRule } from 'extension-shared';
import { isBrowserReady, DEFAULT_GLOBAL, STORAGE_KEYS } from './lib/util';
import type { Filter, FilterLegacy, Global } from './lib/util';

type RemovalTypes = {
	cookies?: boolean;
	localStorage?: boolean;
	indexedDB?: boolean;
	cache?: boolean;
}

type PendingRemovalEntry = {
	history: boolean;
	browsingData: RemovalTypes;
};

const FLUSH_DEBOUNCE_MS = 1000;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushChain: Promise<void> = Promise.resolve();
let pendingRemovals = new Map<string, PendingRemovalEntry>();

function scheduleFlush(): void {
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = undefined;
	}

	flushTimer = setTimeout(() => {
		flushTimer = undefined;
		// Ensure flushes never overlap; flushRemovals will loop until no work is left.
		flushChain = flushChain
			.then(() => flushRemovals())
			.catch((error) => console.error('Error flushing removals:', error));
	}, FLUSH_DEBOUNCE_MS);
}

function enqueueHistoryDomain(domain: string): void {
	if (!domain) {
		return;
	}

	const existing = pendingRemovals.get(domain);
	if (!existing) {
		pendingRemovals.set(domain, { history: true, browsingData: {} });
	} else {
		existing.history = true;
	}

	scheduleFlush();
}

function enqueueBrowsingData(hostname: string, types: RemovalTypes): void {
	if (!hostname) {
		return;
	}

	const existing = pendingRemovals.get(hostname);
	if (!existing) {
		pendingRemovals.set(hostname, { history: false, browsingData: { ...types } });
	} else {
		const merged = existing.browsingData;
		if (types.cookies)      merged.cookies      = true;
		if (types.localStorage) merged.localStorage = true;
		if (types.indexedDB)    merged.indexedDB    = true;
		if (types.cache)        merged.cache        = true;
	}

	scheduleFlush();
}

async function removeBrowsingData(hostnames: string[], removalTypes: RemovalTypes): Promise<void> {
	if (hostnames.length === 0 || Object.keys(removalTypes).length === 0) {
		return;
	}

	const [error] = await tryCatch(browser.browsingData.remove({ hostnames }, removalTypes));
	if (error) {
		console.error(`Error removing browsing data for ${hostnames.join(', ')}:`, error);
	}
}

async function removeHistoryForDomain(domain: string): Promise<void> {
	const searchResults = await browser.history.search({
		text: domain,
		startTime: 0,
		maxResults: Number.MAX_SAFE_INTEGER,
	});

	for (const item of searchResults) {
		if (!item.url) {
			continue;
		}

		const url = parseUrl(item.url)
		if (!url) {
			continue;
		}

		if (!urlMatchesRule(url, domain)) {
			continue;
		}

		await browser.history.deleteUrl({ url: item.url });
	}
}

async function flushRemovals(): Promise<void> {
	if (!isBrowserReady()) {
		scheduleFlush();
		return;
	}

	const pendingEntries = Array.from(pendingRemovals.entries());
	if (pendingEntries.length === 0) {
		return;
	}

	pendingRemovals = new Map<string, PendingRemovalEntry>();
	try {
		const grouped = new Map<string, { hostnames: string[]; removalTypes: RemovalTypes }>();
		const historyDomains: string[] = [];

		for (const [domainOrHostname, entry] of pendingEntries) {
			if (entry.history) {
				historyDomains.push(domainOrHostname);
			}

			const types = entry.browsingData;
			const cookiesEnabled = !!types.cookies;
			const storageEnabled = !!types.localStorage || !!types.indexedDB;
			const cacheEnabled   = !!types.cache;

			if (!cookiesEnabled && !storageEnabled && !cacheEnabled) {
				continue;
			}

			const key = `${cookiesEnabled ? 1 : 0}-${storageEnabled ? 1 : 0}-${cacheEnabled ? 1 : 0}`;
			const existing = grouped.get(key);
			if (existing) {
				existing.hostnames.push(domainOrHostname);
				continue;
			}

			const removalTypes: RemovalTypes = {};
			if (cookiesEnabled) removalTypes.cookies      = true;
			if (storageEnabled) removalTypes.localStorage = true;
			if (storageEnabled) removalTypes.indexedDB    = true;
			if (cacheEnabled)   removalTypes.cache        = true;

			grouped.set(key, { hostnames: [domainOrHostname], removalTypes });
		}

		for (const { hostnames, removalTypes } of grouped.values()) {
			await removeBrowsingData(hostnames, removalTypes);
		}

		for (const domain of historyDomains) {
			await removeHistoryForDomain(domain);
		}
	} catch (error) {
		console.error('Error removing pending data:', error);
	}
}

/*==================================================
	Main function
==================================================*/
main();
async function main(): Promise<void> {
	if (!isBrowserReady()) {
		setTimeout(main, 50);
		return;
	}

	browser.tabs.onUpdated.addListener(async (tabId: number, changeInfo: browser.Tabs.OnUpdatedChangeInfoType, tab: browser.Tabs.Tab | undefined) => {
		if (changeInfo.status === 'complete' && tab?.url) {
			const url = parseUrl(tab.url);
			if (!url) {
				return;
			}

			const tabDomain = url.hostname.toLowerCase();
			if (!tabDomain) {
				return;
			}

			const response = await browser.storage.local.get(STORAGE_KEYS);
			const filters: Filter[] = ((response.filters ?? []) as FilterLegacy[]).map((filter) => ({
				...filter,
				domain: normalizeRule(filter.domain),
			}));
			const global: Global = response.global || DEFAULT_GLOBAL;

			let matchingFilters = filters.filter((filter) => urlMatchesRule(url, filter.domain));
			if (matchingFilters.length === 0) {
				matchingFilters = [{ domain: tabDomain, ...global }];
			}

			for (const filter of matchingFilters) {
				const hasAnyRemovalEnabled = filter.removeHistory || filter.removeCookies || filter.removeStorage || filter.removeCache;
				if (!hasAnyRemovalEnabled) {
					continue;
				}

				if (filter.removeHistory) {
					enqueueHistoryDomain(filter.domain);
				}

				if (filter.removeCookies || filter.removeStorage || filter.removeCache) {
					const types: RemovalTypes = {};
					if (filter.removeCookies) {
						types.cookies = true;
					}

					if (filter.removeStorage) {
						types.localStorage = true;
						types.indexedDB = true;
					}

					if (filter.removeCache) {
						types.cache = true;
					}

					enqueueBrowsingData(tabDomain, types);
				}
			}
		}
	});
}
