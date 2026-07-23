import { moveListItem, normalizeRule } from 'extension-shared';
import { DEFAULT_REMOVALS, REMOVAL_KEYS, REMOVAL_LABELS } from './util';
import type { RemovalFlags, Settings, SiteRule } from '../types/common';

function readBool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function readRemovals(raw: Partial<RemovalFlags> | null | undefined): RemovalFlags {
	return {
		removeCookies:      readBool(raw?.removeCookies,      DEFAULT_REMOVALS.removeCookies),
		removeDownloads:    readBool(raw?.removeDownloads,    DEFAULT_REMOVALS.removeDownloads),
		removeHistory:      readBool(raw?.removeHistory,      DEFAULT_REMOVALS.removeHistory),
		removeIndexedDB:    readBool(raw?.removeIndexedDB,    DEFAULT_REMOVALS.removeIndexedDB),
		removeLocalStorage: readBool(raw?.removeLocalStorage, DEFAULT_REMOVALS.removeLocalStorage),
	};
}

export function formatRemovals(flags: RemovalFlags): string {
	const parts = REMOVAL_KEYS
		.filter((key) => flags[key])
		.map((key) => REMOVAL_LABELS[key]);

	if (parts.length === 0) {
		return 'Remove nothing';
	}

	return `Remove ${parts.join(', ')}`;
}

export function normalizeSettings(stored: unknown): Settings {
	const raw: Partial<Settings> = stored && typeof stored === 'object' ? stored as Partial<Settings> : {};

	return {
		...readRemovals(raw),
		siteRules: normalizeSiteRules(raw.siteRules),
	};
}

export function normalizeSiteRules(raw: unknown): SiteRule[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const byPattern = new Map<string, SiteRule>();
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const item = entry as Partial<SiteRule> & { domain?: string };
		const pattern = normalizeRule(String(item.pattern ?? item.domain ?? ''));
		if (!pattern) {
			continue;
		}

		byPattern.set(pattern, { pattern, ...readRemovals(item) });
	}

	return Array.from(byPattern.values());
}

export function settingsEqual(a: Settings, b: Settings): boolean {
	if (
		a.removeCookies      !== b.removeCookies      ||
		a.removeDownloads    !== b.removeDownloads    ||
		a.removeHistory      !== b.removeHistory      ||
		a.removeIndexedDB    !== b.removeIndexedDB    ||
		a.removeLocalStorage !== b.removeLocalStorage ||
		a.siteRules.length   !== b.siteRules.length
	) {
		return false;
	}

	return a.siteRules.every((rule, index) =>
		rule.pattern            === b.siteRules[index].pattern            &&
		rule.removeCookies      === b.siteRules[index].removeCookies      &&
		rule.removeDownloads    === b.siteRules[index].removeDownloads    &&
		rule.removeHistory      === b.siteRules[index].removeHistory      &&
		rule.removeIndexedDB    === b.siteRules[index].removeIndexedDB    &&
		rule.removeLocalStorage === b.siteRules[index].removeLocalStorage
	);
}

export function findConflictingSiteRule(
	siteRules: SiteRule[],
	target: number | 'new',
	pattern: string,
): SiteRule | undefined {
	const normalized = normalizeRule(pattern);
	if (!normalized) {
		return undefined;
	}

	return siteRules.find((rule, index) => index !== target && rule.pattern === normalized);
}

export function upsertSiteRule(settings: Settings, target: number | 'new', rule: SiteRule): Settings {
	const normalized = normalizeSiteRules([rule]);
	if (normalized.length === 0) {
		if (target === 'new') {
			return settings;
		}
		return deleteSiteRule(settings, target);
	}

	const newRule = normalized[0];
	if (findConflictingSiteRule(settings.siteRules, target, newRule.pattern)) {
		return settings;
	}

	const siteRules = [...settings.siteRules];
	if (target !== 'new' && target >= 0 && target < siteRules.length) {
		siteRules[target] = newRule;
	} else {
		siteRules.push(newRule);
	}

	return { ...settings, siteRules };
}

export function deleteSiteRule(settings: Settings, index: number): Settings {
	if (index < 0 || index >= settings.siteRules.length) {
		return settings;
	}
	return { ...settings, siteRules: settings.siteRules.filter((_, i) => i !== index) };
}

export function moveSiteRule(settings: Settings, index: number, direction: 'up' | 'down'): Settings {
	return { ...settings, siteRules: moveListItem(settings.siteRules, index, direction) };
}
