import browser from 'webextension-polyfill';
import {
	isDiscardableUrl,
	normalizeRule,
	urlMatchesRule,
} from 'extension-shared';

export { isDiscardableUrl, normalizeRule, urlMatchesRule } from 'extension-shared';

/** Per-site override. `timeoutMinutes: null` means never unload matching tabs. */
export type TSiteRule = {
	pattern: string;
	timeoutMinutes: number | null;
};

export type TSettings = {
	enabled: boolean;
	timeoutMinutes: number;
	skipPinned: boolean;
	skipAudible: boolean;
	siteRules: TSiteRule[];
};

export const DEFAULT_SITE_RULE: Readonly<TSiteRule> = Object.freeze({
	pattern: '',
	timeoutMinutes: null,
});

export const DEFAULT_SETTINGS: Readonly<TSettings> = Object.freeze({
	enabled: true,
	timeoutMinutes: 30,
	skipPinned: true,
	skipAudible: true,
	siteRules: Object.freeze([]) as unknown as TSiteRule[],
});

export const STORAGE_KEY = 'settings' as const;

export const ALARM_NAME = 'sleepy-tabs-sweep' as const;

/** Lowest idle timeout the UI/sweeper will honor (minutes). */
export const MIN_TIMEOUT_MINUTES = 0;

export type TTabTimeout = {
	/** Whether this tab is eligible for unloading at all. */
	unload: boolean;
	/** Idle timeout in minutes when `unload` is true. */
	timeoutMinutes: number;
};

/**
 * Merge a stored (possibly partial) settings object onto the defaults.
 * @param stored - The raw value read from storage
 * @returns A fully-populated, sanitized settings object
 */
export function normalizeSettings(stored: unknown): TSettings {
	const raw = (stored ?? {}) as Partial<TSettings>;

	const timeoutMinutes = Number.isFinite(raw.timeoutMinutes)
		? Math.max(MIN_TIMEOUT_MINUTES, Number(raw.timeoutMinutes))
		: DEFAULT_SETTINGS.timeoutMinutes;

	return {
		enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled,
		timeoutMinutes,
		skipPinned: typeof raw.skipPinned === 'boolean' ? raw.skipPinned : DEFAULT_SETTINGS.skipPinned,
		skipAudible: typeof raw.skipAudible === 'boolean' ? raw.skipAudible : DEFAULT_SETTINGS.skipAudible,
		siteRules: normalizeSiteRules(raw.siteRules),
	};
}

/**
 * Turn a raw site-rules value into a clean, de-duplicated list. Later entries
 * win when two rules normalize to the same pattern.
 * @param raw - The stored site-rules value
 */
export function normalizeSiteRules(raw: unknown): TSiteRule[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const byPattern = new Map<string, TSiteRule>();
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const item = entry as Partial<TSiteRule>;
		const pattern = normalizeRule(String(item.pattern ?? ''));
		if (!pattern) {
			continue;
		}

		const timeoutRaw = item.timeoutMinutes;
		const timeoutMinutes =
			timeoutRaw === null || timeoutRaw === undefined
				? null
				: Number.isFinite(timeoutRaw)
					? Math.max(MIN_TIMEOUT_MINUTES, Number(timeoutRaw))
					: null;

		byPattern.set(pattern, { pattern, timeoutMinutes });
	}

	return Array.from(byPattern.values());
}

/**
 * Pick the most specific matching site rule for a tab URL. Longer patterns
 * win so `youtube.com/watch?v` overrides `youtube.com`.
 * @param url - The tab's URL (may be undefined)
 * @param siteRules - Normalized site rules
 */
export function findMatchingSiteRule(url: string | undefined, siteRules: TSiteRule[]): TSiteRule | null {
	let best: TSiteRule | null = null;
	for (const rule of siteRules) {
		if (!urlMatchesRule(url, rule.pattern)) {
			continue;
		}

		if (!best || rule.pattern.length > best.pattern.length) {
			best = rule;
		}
	}
	return best;
}

/**
 * Resolve the unload policy and idle timeout for a tab URL.
 * @param url - The tab's URL (may be undefined)
 * @param settings - The current settings
 */
export function resolveTabTimeout(url: string | undefined, settings: TSettings): TTabTimeout {
	if (!settings.enabled) {
		return { unload: false, timeoutMinutes: settings.timeoutMinutes };
	}

	const match = findMatchingSiteRule(url, settings.siteRules);
	if (!match) {
		return { unload: true, timeoutMinutes: settings.timeoutMinutes };
	}

	if (match.timeoutMinutes === null) {
		return { unload: false, timeoutMinutes: settings.timeoutMinutes };
	}

	return { unload: true, timeoutMinutes: match.timeoutMinutes };
}

/** Minimum alarm delay the browser reliably supports (minutes). */
export const MIN_SWEEP_DELAY_MINUTES = 1;

type TTabIdleInfo = Pick<
	browser.Tabs.Tab,
	'active' | 'discarded' | 'id' | 'url' | 'pinned' | 'audible' | 'lastAccessed'
>;

/**
 * Milliseconds until a tab becomes eligible for unload, or `0` if it is now.
 * Returns `null` when the tab is not being watched (active, discarded, excluded, etc.).
 */
export function msUntilTabEligible(tab: TTabIdleInfo, settings: TSettings, now: number): number | null {
	if (tab.active || tab.discarded || typeof tab.id !== 'number') {
		return null;
	}

	if (!isDiscardableUrl(tab.url)) {
		return null;
	}

	if (settings.skipPinned && tab.pinned) {
		return null;
	}

	if (settings.skipAudible && tab.audible) {
		return null;
	}

	const tabTimeout = resolveTabTimeout(tab.url, settings);
	if (!tabTimeout.unload || typeof tab.lastAccessed !== 'number') {
		return null;
	}

	const idleMs = now - tab.lastAccessed;
	const timeoutMs = tabTimeout.timeoutMinutes * 60 * 1000;
	return idleMs >= timeoutMs ? 0 : timeoutMs - idleMs;
}

/** Whether a tab should be unloaded on the next sweep. */
export function shouldUnload(tab: TTabIdleInfo, settings: TSettings, now: number): boolean {
	const ms = msUntilTabEligible(tab, settings, now);
	return ms !== null && ms === 0;
}

/**
 * How long to wait before the next sweep, based on live tab state.
 * Returns `null` when unloading is disabled or no tabs are being watched.
 */
export function nextSweepDelayMinutes(settings: TSettings, tabs: TTabIdleInfo[], now: number): number | null {
	if (!settings.enabled) {
		return null;
	}

	let soonestMs = Infinity;

	for (const tab of tabs) {
		const remaining = msUntilTabEligible(tab, settings, now);
		if (remaining === null) {
			continue;
		}

		soonestMs = Math.min(soonestMs, remaining);
	}

	if (soonestMs === Infinity) {
		return null;
	}

	return Math.max(MIN_SWEEP_DELAY_MINUTES, Math.ceil(soonestMs / 60_000));
}

/** Whether two normalized settings objects are equivalent. */
export function settingsEqual(a: TSettings, b: TSettings): boolean {
	if (
		a.enabled !== b.enabled ||
		a.timeoutMinutes !== b.timeoutMinutes ||
		a.skipPinned !== b.skipPinned ||
		a.skipAudible !== b.skipAudible ||
		a.siteRules.length !== b.siteRules.length
	) {
		return false;
	}

	return a.siteRules.every(
		(rule, index) =>
			rule.pattern === b.siteRules[index].pattern &&
			rule.timeoutMinutes === b.siteRules[index].timeoutMinutes,
	);
}

/*==================================================
	Try catch
==================================================*/
type Success<T> = readonly [null, T]
type Failure<E> = readonly [E, null]
type ResultSync<T, E> = Success<T> | Failure<E>
type ResultAsync<T, E> = Promise<ResultSync<T, E>>
type Operation<T> = Promise<T> | (() => T) | (() => Promise<T>)

export function tryCatch<T, E = Error>(operation: Promise<T>): ResultAsync<T, E>
export function tryCatch<T, E = Error>(operation: () => Promise<T>): ResultAsync<T, E>
export function tryCatch<T, E = Error>(operation: () => T): ResultSync<T, E>
export function tryCatch<T, E = Error>(operation: Operation<T>): ResultSync<T, E> | ResultAsync<T, E> {
	if (operation instanceof Promise) {
		return operation.then((data: T) => [null, data] as const).catch((error: E) => [error as E, null] as const)
	}

	try {
		const result = operation()

		if (result instanceof Promise) {
			return result.then((data: T) => [null, data] as const).catch((error: E) => [error as E, null] as const)
		}

		return [null, result] as const
	} catch (error) {
		return [error as E, null] as const
	}
}

/*==================================================
	Is browser ready
==================================================*/
export function isBrowserReady(): boolean {
	return !!(browser && browser.storage && browser.storage.local && browser.tabs && browser.alarms);
}
