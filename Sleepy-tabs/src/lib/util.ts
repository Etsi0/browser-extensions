import { Settings, SiteRule } from "../types/common";

export const DEFAULT_SITE_RULE: Readonly<SiteRule> = Object.freeze({
	pattern: '',
	timeoutMinutes: null,
});

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	enabled: true,
	timeoutMinutes: 30,
	skipPinned: true,
	skipAudible: true,
	siteRules: Object.freeze([]) as unknown as SiteRule[],
});

export const STORAGE_KEY = 'settings' as const;

export const ALARM_NAME = 'sleepy-tabs-sweep' as const;

/** Lowest idle timeout the UI/sweeper will honor (minutes). */
export const MIN_TIMEOUT_MINUTES = 0;
export const MIN_SWEEP_DELAY_MINUTES = 1; // the browser do not reliably supports less then 1min

/** Duration options shared by the global and per-site selectors (minutes). */
export const DURATION_OPTIONS: readonly number[] = Object.freeze([1, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240]);