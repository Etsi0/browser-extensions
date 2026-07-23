import { getRulePatternFeedback, moveListItem, normalizeRule } from 'extension-shared';
import { DEFAULT_SETTINGS, MIN_TIMEOUT_MINUTES } from './util';
import type { Settings, SiteRule } from '../types/common';

/** Merge a stored (possibly partial) value onto the defaults, sanitizing fields. */
export function normalizeSettings(stored: unknown): Settings {
	const raw: Partial<Settings> = stored && typeof stored === 'object' ? stored : {};
	const timeoutMinutes = typeof raw.timeoutMinutes === 'number' && Number.isFinite(raw.timeoutMinutes)
		? Math.max(MIN_TIMEOUT_MINUTES, raw.timeoutMinutes)
		: DEFAULT_SETTINGS.timeoutMinutes;

	return {
		enabled:     typeof raw.enabled     === 'boolean' ? raw.enabled     : DEFAULT_SETTINGS.enabled,
		timeoutMinutes,
		skipPinned:  typeof raw.skipPinned  === 'boolean' ? raw.skipPinned  : DEFAULT_SETTINGS.skipPinned,
		skipAudible: typeof raw.skipAudible === 'boolean' ? raw.skipAudible : DEFAULT_SETTINGS.skipAudible,
		siteRules: normalizeSiteRules(raw.siteRules),
	};
}

/** Clean and de-duplicate site rules. Later entries win on pattern collision. */
export function normalizeSiteRules(raw: unknown): SiteRule[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const byPattern = new Map<string, SiteRule>();
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const item = entry as Partial<SiteRule>;
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

export function settingsEqual(a: Settings, b: Settings): boolean {
	if (
		a.enabled          !== b.enabled          ||
		a.timeoutMinutes   !== b.timeoutMinutes   ||
		a.skipPinned       !== b.skipPinned       ||
		a.skipAudible      !== b.skipAudible      ||
		a.siteRules.length !== b.siteRules.length
	) {
		return false;
	}

	return a.siteRules.every((rule, index) =>
		rule.pattern        === b.siteRules[index].pattern        &&
		rule.timeoutMinutes === b.siteRules[index].timeoutMinutes
	);
}

export function hasValidPattern(rule: SiteRule): boolean {
	const { normalized, incompleteRegex, invalidRegex, invalidUrl } = getRulePatternFeedback(rule.pattern);
	return normalized !== '' && !incompleteRegex && !invalidRegex && !invalidUrl;
}

/** Rule at another index that already uses this pattern. */
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

/**
 * Insert or update a rule. `target` is an existing index, or `'new'` to append.
 * An empty pattern removes the targeted rule (or is a no-op when adding).
 */
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
