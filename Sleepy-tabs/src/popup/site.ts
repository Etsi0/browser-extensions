import { isBrowserReady, DEFAULT_SITE_RULE, normalizeRule, TSettings } from '../lib/util';
import {
	applySiteRuleForm,
	deleteSiteRule,
	hasValidPattern,
	loadSettings,
	parseSitePageParams,
	readSiteRuleForm,
	saveSettings,
	upsertSiteRule,
} from './settings';
import './input.css';

let siteForm: HTMLFormElement | null;
let siteHeading: HTMLElement | null;
let deleteButton: HTMLButtonElement | null;
let saveTimeout: ReturnType<typeof setTimeout> | undefined;
let persistedSettings: TSettings | null = null;
let pageParams = parseSitePageParams();
let skipAutoSave = false;

function isDOMReady(): boolean {
	if (siteForm && siteHeading && deleteButton) {
		return true;
	}
	if (!document) {
		return false;
	}
	siteForm ??= document.querySelector('#site-form');
	siteHeading ??= document.querySelector('#site-heading');
	deleteButton ??= document.querySelector<HTMLButtonElement>('button[name="delete"]');
	return !!(siteForm && siteHeading && deleteButton);
}

function debounceSave<T extends (...args: unknown[]) => void>(func: T, delay: number = 300): (...args: Parameters<T>) => void {
	return (...args: Parameters<T>) => {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => func(...args), delay);
	};
}

function updateHeading(pattern: string): void {
	if (!siteHeading) {
		return;
	}
	const trimmed = pattern.trim();
	siteHeading.textContent = trimmed || 'New site rule';
	siteHeading.title = trimmed;
}

function updateDeleteVisibility(ruleSaved: boolean): void {
	if (!deleteButton) {
		return;
	}
	deleteButton.hidden = !ruleSaved;
}

function readAndMergeSettings(): TSettings | null {
	if (!persistedSettings || !siteForm || !pageParams) {
		return null;
	}
	const rule = readSiteRuleForm(siteForm);
	if (!hasValidPattern(rule)) {
		if (pageParams.mode === 'edit') {
			return deleteSiteRule(persistedSettings, pageParams.index);
		}
		return persistedSettings;
	}
	const target = pageParams.mode === 'new' ? 'new' : pageParams.index;
	return upsertSiteRule(persistedSettings, target, rule);
}

async function persistSettings(): Promise<void> {
	if (!isDOMReady() || !pageParams) {
		return;
	}
	const settings = readAndMergeSettings();
	if (!settings) {
		return;
	}
	const saved = await saveSettings(settings, persistedSettings);
	if (saved) {
		persistedSettings = saved;
		if (pageParams.mode === 'new' && siteForm) {
			const rule = readSiteRuleForm(siteForm);
			if (hasValidPattern(rule)) {
				const normalizedPattern = normalizeRule(rule.pattern);
				const index = saved.siteRules.findIndex((r) => r.pattern === normalizedPattern);
				if (index >= 0) {
					pageParams = { mode: 'edit', index };
					history.replaceState(null, '', `./site.html?index=${index}`);
					updateDeleteVisibility(true);
				}
			}
		}
	}
}

const debouncedSave = debounceSave(persistSettings, 300);

function flushSave(): void {
	if (skipAutoSave) {
		return;
	}
	if (saveTimeout) {
		clearTimeout(saveTimeout);
		saveTimeout = undefined;
	}
	void persistSettings();
}

async function deleteSiteRuleAndLeave(): Promise<void> {
	if (!persistedSettings || pageParams?.mode !== 'edit') {
		return;
	}
	if (saveTimeout) {
		clearTimeout(saveTimeout);
		saveTimeout = undefined;
	}
	skipAutoSave = true;
	persistedSettings = deleteSiteRule(persistedSettings, pageParams.index);
	await saveSettings(persistedSettings, null);
	location.href = './index.html';
}

function navigateBack(): void {
	flushSave();
	location.href = './index.html';
}

(() => {
	setupEventDelegation();
	void initPage();
})();

async function initPage(): Promise<void> {
	if (!isDOMReady() || !isBrowserReady()) {
		setTimeout(initPage, 50);
		return;
	}

	if (!pageParams) {
		location.href = './index.html';
		return;
	}

	const settings = await loadSettings();

	if (pageParams.mode === 'edit') {
		if (pageParams.index >= settings.siteRules.length) {
			location.href = './index.html';
			return;
		}
		applySiteRuleForm(siteForm!, settings.siteRules[pageParams.index]);
		updateHeading(settings.siteRules[pageParams.index].pattern);
		updateDeleteVisibility(true);
	} else {
		applySiteRuleForm(siteForm!, DEFAULT_SITE_RULE);
		updateHeading('');
		updateDeleteVisibility(false);
	}

	persistedSettings = settings;
}

function setupEventDelegation(): void {
	if (!isDOMReady()) {
		setTimeout(setupEventDelegation, 50);
		return;
	}

	document.body.addEventListener('click', (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.getAttribute('name') === 'back') {
			e.preventDefault();
			navigateBack();
			return;
		}
		if (target.closest('button[name="delete"]')) {
			e.preventDefault();
			void deleteSiteRuleAndLeave();
		}
	});

	document.body.addEventListener('input', (e: Event) => {
		const target = e.target;
		if (target instanceof HTMLInputElement && target.name === 'pattern') {
			updateHeading(target.value);
			debouncedSave();
		}
	});

	document.body.addEventListener('change', (e: Event) => {
		const target = e.target;
		if (target instanceof HTMLSelectElement && target.name === 'duration') {
			flushSave();
		}
	});
}

addEventListener('beforeunload', flushSave);
addEventListener('visibilitychange', () => {
	if (document.hidden) {
		flushSave();
	}
});
