import type Browser from 'webextension-polyfill';
import { isDiscardableUrl, parseUrl, urlMatchesRule } from 'extension-shared';
import { MIN_SWEEP_DELAY_MINUTES } from './util';
import type { Settings, SiteRule, TabTimeout } from '../types/common';

/**
 * Pick the most specific matching site rule for a tab URL. Longer patterns win
 * so `youtube.com/watch` overrides `youtube.com`.
 */
export function findMatchingSiteRule(url: URL, siteRules: SiteRule[]): SiteRule | null {
	let best: SiteRule | null = null;
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

/** Resolve the unload policy and idle timeout for a tab URL. */
export function resolveTabTimeout(url: URL, settings: Settings): TabTimeout {
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

/**
 * Milliseconds until a tab becomes eligible for unload, or `0` if it is now.
 * Returns `null` when the tab is not being watched (active, discarded, excluded, etc.).
 */
export function msUntilTabEligible(tab: Browser.Tabs.Tab, settings: Settings, now: number): number | null {
	if (tab.active || tab.discarded || typeof tab.id !== 'number') {
		return null;
	}

	const url = parseUrl(tab.url);
	if (!url) {
		return null;
	}

	if (!isDiscardableUrl(url)) {
		return null;
	}

	if (settings.skipPinned && tab.pinned) {
		return null;
	}

	if (settings.skipAudible && tab.audible) {
		return null;
	}

	const tabTimeout = resolveTabTimeout(url, settings);
	if (!tabTimeout.unload || typeof tab.lastAccessed !== 'number') {
		return null;
	}

	const idleMs = now - tab.lastAccessed;
	const timeoutMs = tabTimeout.timeoutMinutes * 60 * 1000;
	return idleMs >= timeoutMs ? 0 : timeoutMs - idleMs;
}

/** Whether a tab should be unloaded on the next sweep. */
export function shouldUnload(tab: Browser.Tabs.Tab, settings: Settings, now: number): boolean {
	return msUntilTabEligible(tab, settings, now) === 0;
}

/**
 * How long to wait before the next sweep, based on live tab state.
 * Returns `null` when unloading is disabled or no tabs are being watched.
 */
export function nextSweepDelayMinutes(settings: Settings, tabs: Browser.Tabs.Tab[], now: number): number | null {
	if (!settings.enabled) {
		return null;
	}

	let soonestMs = Infinity;
	for (const tab of tabs) {
		const remaining = msUntilTabEligible(tab, settings, now);
		if (remaining !== null) {
			soonestMs = Math.min(soonestMs, remaining);
		}
	}

	if (soonestMs === Infinity) {
		return null;
	}

	return Math.max(MIN_SWEEP_DELAY_MINUTES, Math.ceil(soonestMs / 60_000));
}
