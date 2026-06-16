import browser from 'webextension-polyfill';
import { extractHostname, normalizeRule, urlMatchesRule } from 'extension-shared';
import { tryCatch, isBrowserReady, TFilter, TFilterLegacy, TGlobal, DEFAULT_GLOBAL, STORAGE_KEYS } from './lib/util';

type TRemovalTypes = {
	cookies?: boolean;
	localStorage?: boolean;
	indexedDB?: boolean;
	cache?: boolean;
}

type TPendingRemovalEntry = {
	history: boolean;
	browsingData: TRemovalTypes;
};

const FLUSH_DEBOUNCE_MS = 1000;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushChain: Promise<void> = Promise.resolve();
let pendingRemovals = new Map<string, TPendingRemovalEntry>();

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

function enqueueBrowsingData(hostname: string, types: TRemovalTypes): void {
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

async function removeBrowsingDataForDomain(
	domain: string,
	removeCookies: boolean,
	removeStorage: boolean,
	removeCache: boolean
): Promise<void> {
	const [error] = await tryCatch(async () => {
		const removalTypes: TRemovalTypes = {};

		if (removeCookies) {
			removalTypes.cookies = true;
		}

		if (removeStorage) {
			removalTypes.localStorage = true;
			removalTypes.indexedDB = true;
		}

		if (removeCache) {
			removalTypes.cache = true;
		}

		if (Object.keys(removalTypes).length > 0) {
			await browser.browsingData.remove({
				hostnames: [domain],
			}, removalTypes);
		}
	});

	if (error) {
		console.error(`Error removing browsing data for domain ${domain}:`, error);
	}
}

async function removeHistoryForDomain(domain: string): Promise<void> {
	if (!isBrowserReady()) {
		setTimeout(removeHistoryForDomain, 50, domain);
		return;
	}

	const searchResults = await browser.history.search({
		text: domain,
		startTime: 0,
		maxResults: Number.MAX_SAFE_INTEGER,
	});

	for (const item of searchResults) {
		if (!item.url) {
			continue;
		}

		const itemDomain = extractHostname(item.url);
		if (!itemDomain || !urlMatchesRule(item.url, domain)) {
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

	pendingRemovals = new Map<string, TPendingRemovalEntry>();
	try {
		const grouped = new Map<string, { hostnames: string[]; removalTypes: TRemovalTypes }>();
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

			const removalTypes: TRemovalTypes = {};
			if (cookiesEnabled) removalTypes.cookies      = true;
			if (storageEnabled) removalTypes.localStorage = true;
			if (storageEnabled) removalTypes.indexedDB    = true;
			if (cacheEnabled)   removalTypes.cache        = true;

			grouped.set(key, { hostnames: [domainOrHostname], removalTypes });
		}

		for (const { hostnames, removalTypes } of grouped.values()) {
			const removeCookies = !!removalTypes.cookies;
			const removeStorage = !!removalTypes.localStorage || !!removalTypes.indexedDB;
			const removeCache   = !!removalTypes.cache;

			for (const hostname of hostnames) {
				await removeBrowsingDataForDomain(hostname, removeCookies, removeStorage, removeCache);
			}
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
			const response = await browser.storage.local.get(STORAGE_KEYS);
			const filters: TFilter[] = ((response.filters ?? []) as TFilterLegacy[]).map((filter) => ({
				...filter,
				domain: normalizeRule(filter.domain),
			}));
			const global: TGlobal = response.global || DEFAULT_GLOBAL;

			const tabDomain = extractHostname(tab.url);
			if (!tabDomain) {
				return;
			}

			let matchingFilters = filters.filter((filter) => urlMatchesRule(tab.url, filter.domain));
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
					const types: TRemovalTypes = {};
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
