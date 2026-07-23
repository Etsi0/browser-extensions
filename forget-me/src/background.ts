import browser from 'webextension-polyfill';
import { debounce, isRegex, parseUrl, tryCatch, urlMatchesRule } from 'extension-shared';
import { loadSettings, onSettingsChanged } from './lib/storage';
import type { Settings, SiteRule } from './types/common';

type RemovalTypes = Pick<browser.BrowsingData.DataTypeSet, 'cookies' | 'downloads' | 'indexedDB' | 'localStorage'>;

type PendingRemovalEntry = {
	history: boolean;
	browsingData: RemovalTypes;
};

const FLUSH_DEBOUNCE_MS = 1000;
const HISTORY_DELETE_BATCH = 50;
let flushChain: Promise<void> = Promise.resolve();
let pendingRemovals = new Map<string, PendingRemovalEntry>();

const scheduleFlush = debounce(() => {
	flushChain = flushChain
		.then(() => flushRemovals())
		.catch((error) => console.error('Error flushing removals:', error));
}, FLUSH_DEBOUNCE_MS);

function enqueueHistoryDomain(domain: string): void {
	const existing = pendingRemovals.get(domain);
	if (!existing) {
		pendingRemovals.set(domain, { history: true, browsingData: {} });
	} else {
		existing.history = true;
	}

	scheduleFlush();
}

function enqueueBrowsingData(hostname: string, types: RemovalTypes): void {
	const existing = pendingRemovals.get(hostname);
	if (!existing) {
		pendingRemovals.set(hostname, { history: false, browsingData: { ...types } });
	} else {
		Object.assign(existing.browsingData, types);
	}

	scheduleFlush();
}

async function removeBrowsingData(hostnames: string[], types: RemovalTypes): Promise<void> {
	const [error] = await tryCatch(browser.browsingData.remove({ hostnames }, types));
	if (error) {
		console.error(`Error removing ${Object.keys(types).join(', ')} for ${hostnames.join(', ')}:`, error);
	}
}

async function removeDownloads(hostnames: string[]): Promise<void> {
	if (hostnames.length === 0) {
		return;
	}

	const [error] = await tryCatch(async () => {
		const erased = new Set<number>();
		const erasing: Promise<number[]>[] = [];
		for (const hostname of hostnames) {
			const items = await browser.downloads.search({ query: [hostname] });
			for (const item of items) {
				const url = parseUrl(item.url);
				if (!url || erased.has(item.id) || !urlMatchesRule(url, hostname)) {
					continue;
				}

				erased.add(item.id);
				erasing.push(browser.downloads.erase({ id: item.id }));
			}
		}

		await Promise.all(erasing);
	});

	if (error) {
		console.error(`Error removing downloads for ${hostnames.join(', ')}:`, error);
	}
}

function historySearchText(rule: string): string | undefined {
	if (isRegex(rule)) {
		return '';
	}

	return parseUrl(`http://${rule}`)?.hostname;
}

async function removeHistory(filterDomains: string[]): Promise<void> {
	const searchTexts = new Set<string>();
	for (const domain of filterDomains) {
		const text = historySearchText(domain);
		if (text === undefined) {
			continue;
		}

		searchTexts.add(text);
	}

	if (searchTexts.has('')) {
		searchTexts.clear();
		searchTexts.add('');
	}

	const [error] = await tryCatch(async () => {
		const matched = new Set<string>();
		for (const text of searchTexts) {
			const historyItems = await browser.history.search({
				text,
				startTime: 0,
				maxResults: Number.MAX_SAFE_INTEGER,
			});

			for (const item of historyItems) {
				const rawUrl = item.url;
				if (!rawUrl || matched.has(rawUrl)) {
					continue;
				}

				const historyUrl = parseUrl(rawUrl);
				if (historyUrl && filterDomains.some((domain) => urlMatchesRule(historyUrl, domain))) {
					matched.add(rawUrl);
				}
			}
		}

		const urls = Array.from(matched);
		for (let i = 0; i < urls.length; i += HISTORY_DELETE_BATCH) {
			await Promise.all(urls.slice(i, i + HISTORY_DELETE_BATCH).map((url) => browser.history.deleteUrl({ url })));
		}
	});

	if (error) {
		console.error(`Error removing history for ${filterDomains.join(', ')}:`, error);
	}
}

async function flushRemovals(): Promise<void> {
	const pendingEntries = Array.from(pendingRemovals.entries());
	if (pendingEntries.length === 0) {
		return;
	}

	pendingRemovals = new Map<string, PendingRemovalEntry>();

	const downloads: string[] = [];
	const history:   string[] = [];
	const browsingData = new Map<string, { hostnames: string[]; types: RemovalTypes }>();

	for (const [domainOrHostname, entry] of pendingEntries) {
		const { cookies, indexedDB, localStorage } = entry.browsingData;
		if (entry.browsingData.downloads) downloads.push(domainOrHostname);
		if (entry.history) history.push(domainOrHostname);
		if (!cookies && !indexedDB && !localStorage) {
			continue;
		}

		const key = `${cookies ? 'c' : ''}${indexedDB ? 'i' : ''}${localStorage ? 'l' : ''}`;
		const group = browsingData.get(key);
		if (group) {
			group.hostnames.push(domainOrHostname);
			continue;
		}

		const types: RemovalTypes = {};
		if (cookies)      types.cookies      = true;
		if (indexedDB)    types.indexedDB    = true;
		if (localStorage) types.localStorage = true;
		browsingData.set(key, { hostnames: [domainOrHostname], types });
	}

	await Promise.all([
		...Array.from(browsingData.values(), ({ hostnames, types }) => removeBrowsingData(hostnames, types)),
		removeDownloads(downloads),
		removeHistory(history),
	]);
}

function applyRemovals(filter: SiteRule, tabDomain: string): void {
	if (filter.removeHistory) {
		enqueueHistoryDomain(filter.pattern);
	}

	if (filter.removeCookies || filter.removeLocalStorage || filter.removeIndexedDB || filter.removeDownloads) {
		const types: RemovalTypes = {};
		if (filter.removeCookies) {
			types.cookies = true;
		}

		if (filter.removeLocalStorage) {
			types.localStorage = true;
		}

		if (filter.removeIndexedDB) {
			types.indexedDB = true;
		}

		if (filter.removeDownloads) {
			types.downloads = true;
		}

		enqueueBrowsingData(tabDomain, types);
	}
}

/*==================================================
	Tab tracking
==================================================*/
const TAB_URLS_SESSION_KEY = 'tabUrls';
const tabUrls = new Map<number, URL>();
const persistTabUrls = debounce(() => {
	const record: Record<string, string> = {};
	for (const [tabId, url] of tabUrls) {
		record[tabId] = url.href;
	}

	void browser.storage.session.set({ [TAB_URLS_SESSION_KEY]: record });
}, 250);

function trackTabUrl(tabId: number, rawUrl: string | undefined): URL | undefined {
	const url = parseUrl(rawUrl);
	if (!url?.hostname) {
		return undefined;
	}

	const previous = tabUrls.get(tabId);
	tabUrls.set(tabId, url);
	if (previous?.href !== url.href) {
		persistTabUrls();
	}

	return url;
}

async function restoreTabUrls(): Promise<void> {
	const [stored, tabs] = await Promise.all([
		browser.storage.session.get(TAB_URLS_SESSION_KEY),
		browser.tabs.query({}),
	]);

	const liveTabIds = new Set<number>();
	for (const tab of tabs) {
		if (tab.id != null) {
			liveTabIds.add(tab.id);
		}
	}

	const record = stored[TAB_URLS_SESSION_KEY] as Record<string, string> | undefined;
	const closedWhileSuspended: URL[] = [];
	for (const [key, href] of Object.entries(record ?? {})) {
		const url = parseUrl(href);
		if (!url?.hostname) {
			continue;
		}

		const tabId = Number(key);
		if (liveTabIds.has(tabId)) {
			tabUrls.set(tabId, url);
		} else {
			closedWhileSuspended.push(url);
		}
	}

	for (const tab of tabs) {
		const url = tab.id != null && !tabUrls.has(tab.id) ? parseUrl(tab.url) : undefined;
		if (tab.id != null && url?.hostname) {
			tabUrls.set(tab.id, url);
		}
	}

	if (closedWhileSuspended.length > 0 || (record === undefined && tabUrls.size > 0)) {
		persistTabUrls();
	}

	for (const url of closedWhileSuspended) {
		void forgetUrl(url);
	}
}

function hostnameStillOpen(hostname: string): boolean {
	for (const url of tabUrls.values()) {
		if (url.hostname === hostname) {
			return true;
		}
	}

	return false;
}

let settingsPromise: Promise<Settings> | undefined;
onSettingsChanged((settings) => {
	settingsPromise = Promise.resolve(settings);
});

async function forgetUrl(url: URL): Promise<void> {
	const tabDomain = url.hostname;
	if (hostnameStillOpen(tabDomain)) {
		return;
	}

	const settings = await (settingsPromise ??= loadSettings());
	const matching = settings.siteRules.filter((rule) => urlMatchesRule(url, rule.pattern));
	const filters: SiteRule[] = matching.length > 0
		? matching
		: [{
			pattern: tabDomain,
			removeCookies:      settings.removeCookies,
			removeDownloads:    settings.removeDownloads,
			removeHistory:      settings.removeHistory,
			removeIndexedDB:    settings.removeIndexedDB,
			removeLocalStorage: settings.removeLocalStorage,
		}];

	for (const filter of filters) {
		applyRemovals(filter, tabDomain);
	}
}

/*==================================================
	Main
==================================================*/
main();
function main(): void {
	const ready = restoreTabUrls().catch((error) => console.error('Error restoring tab urls:', error));

	browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
		const rawUrl = changeInfo.url ?? (changeInfo.status === 'complete' ? tab?.url : undefined);
		if (!rawUrl) {
			return;
		}

		await ready;
		const previous = tabUrls.get(tabId);
		const next = trackTabUrl(tabId, rawUrl);
		if (previous && next && previous.hostname !== next.hostname) {
			void forgetUrl(previous);
		}
	}, { properties: ['url', 'status'] });

	browser.tabs.onRemoved.addListener(async (tabId) => {
		await ready;
		const url = tabUrls.get(tabId);
		if (!url) {
			return;
		}

		tabUrls.delete(tabId);
		persistTabUrls();
		void forgetUrl(url);
	});
}