import browser from 'webextension-polyfill';
import {
	normalizeRule,
	normalizeSettings,
	normalizeSiteRules,
	settingsEqual,
	TSiteRule,
	TSettings,
	STORAGE_KEY,
} from '../lib/util';

export type TSitePageParams = { mode: 'edit'; index: number } | { mode: 'new' };

export function durationToMinutes(value: string): number | null {
	return value === 'never' ? null : Number(value);
}

export function minutesToDuration(timeoutMinutes: number | null): string {
	return timeoutMinutes === null ? 'never' : String(timeoutMinutes);
}

export async function loadSettings(): Promise<TSettings> {
	const response = await browser.storage.local.get(STORAGE_KEY);
	return normalizeSettings(response[STORAGE_KEY]);
}

export async function saveSettings(settings: TSettings, persisted: TSettings | null): Promise<TSettings | null> {
	if (persisted && settingsEqual(settings, persisted)) {
		return persisted;
	}
	await browser.storage.local.set({ [STORAGE_KEY]: settings });
	return settings;
}

export function readGlobalSettings(root: ParentNode): Pick<TSettings, 'enabled' | 'timeoutMinutes' | 'skipPinned' | 'skipAudible'> {
	const durationInput = root.querySelector<HTMLSelectElement>('select[name="duration"]');
	const skipPinnedInput = root.querySelector<HTMLInputElement>('input[name="skipPinned"]');
	const skipAudibleInput = root.querySelector<HTMLInputElement>('input[name="skipAudible"]');

	const durationValue = durationInput?.value ?? 'never';
	const enabled = durationValue !== 'never';
	const timeoutRaw = Number(durationValue);

	return {
		enabled,
		timeoutMinutes: enabled && Number.isFinite(timeoutRaw) ? timeoutRaw : 30,
		skipPinned: !skipPinnedInput?.checked,
		skipAudible: !skipAudibleInput?.checked,
	};
}

export function applyGlobalSettings(root: ParentNode, settings: TSettings): void {
	const durationInput = root.querySelector<HTMLSelectElement>('select[name="duration"]');
	const skipPinnedInput = root.querySelector<HTMLInputElement>('input[name="skipPinned"]');
	const skipAudibleInput = root.querySelector<HTMLInputElement>('input[name="skipAudible"]');

	if (durationInput) {
		durationInput.value = settings.enabled ? String(settings.timeoutMinutes) : 'never';
	}
	if (skipPinnedInput) {
		skipPinnedInput.checked = !settings.skipPinned;
	}
	if (skipAudibleInput) {
		skipAudibleInput.checked = !settings.skipAudible;
	}
}

export function readSiteRuleForm(form: ParentNode): TSiteRule {
	const pattern = form.querySelector<HTMLInputElement>('input[name="pattern"]')?.value ?? '';
	const durationValue = form.querySelector<HTMLSelectElement>('select[name="duration"]')?.value ?? 'never';
	return {
		pattern,
		timeoutMinutes: durationToMinutes(durationValue),
	};
}

export function applySiteRuleForm(form: ParentNode, rule: TSiteRule): void {
	const patternInput = form.querySelector<HTMLInputElement>('input[name="pattern"]');
	const durationSelect = form.querySelector<HTMLSelectElement>('select[name="duration"]');

	if (patternInput) {
		patternInput.value = rule.pattern;
	}
	if (durationSelect) {
		durationSelect.value = minutesToDuration(rule.timeoutMinutes);
	}
}

export function upsertSiteRule(settings: TSettings, target: number | 'new', rule: TSiteRule): TSettings {
	const normalized = normalizeSiteRules([rule]);
	if (normalized.length === 0) {
		if (target === 'new') {
			return settings;
		}
		const siteRules = settings.siteRules.filter((_, i) => i !== target);
		return { ...settings, siteRules };
	}

	const newRule = normalized[0];
	const siteRules = [...settings.siteRules];

	if (target === 'new') {
		const existingIndex = siteRules.findIndex((r) => r.pattern === newRule.pattern);
		if (existingIndex >= 0) {
			siteRules[existingIndex] = newRule;
		} else {
			siteRules.push(newRule);
		}
	} else {
		if (target < 0 || target >= siteRules.length) {
			siteRules.push(newRule);
		} else {
			siteRules[target] = newRule;
		}
	}

	return { ...settings, siteRules: normalizeSiteRules(siteRules) };
}

export function deleteSiteRule(settings: TSettings, index: number): TSettings {
	if (index < 0 || index >= settings.siteRules.length) {
		return settings;
	}
	const siteRules = settings.siteRules.filter((_, i) => i !== index);
	return { ...settings, siteRules };
}

export function moveSiteRule(settings: TSettings, index: number, direction: 'up' | 'down'): TSettings {
	const targetIndex = direction === 'up' ? index - 1 : index + 1;
	if (index < 0 || index >= settings.siteRules.length || targetIndex < 0 || targetIndex >= settings.siteRules.length) {
		return settings;
	}
	const siteRules = [...settings.siteRules];
	[siteRules[index], siteRules[targetIndex]] = [siteRules[targetIndex], siteRules[index]];
	return { ...settings, siteRules };
}

export function parseSitePageParams(): TSitePageParams | null {
	const params = new URLSearchParams(location.search);
	if (params.has('new')) {
		return { mode: 'new' };
	}
	const indexRaw = params.get('index');
	if (indexRaw !== null) {
		const index = Number(indexRaw);
		if (Number.isInteger(index) && index >= 0) {
			return { mode: 'edit', index };
		}
	}
	return null;
}

export function hasValidPattern(rule: TSiteRule): boolean {
	return normalizeRule(rule.pattern) !== '';
}
