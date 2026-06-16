import { isBrowserReady, normalizeSettings, TSiteRule, TSettings } from '../lib/util';
import {
	applyGlobalSettings,
	deleteSiteRule,
	loadSettings,
	moveSiteRule,
	readGlobalSettings,
	saveSettings,
} from './settings';
import './input.css';

let durationInput: HTMLSelectElement | null;
let skipPinnedInput: HTMLInputElement | null;
let skipAudibleInput: HTMLInputElement | null;
let template: HTMLTemplateElement | null;
let siteRulesContainer: HTMLElement | null;
let saveTimeout: ReturnType<typeof setTimeout> | undefined;
let persistedSettings: TSettings | null = null;

function isDOMReady(): boolean {
	if (
		durationInput &&
		skipPinnedInput &&
		skipAudibleInput &&
		template &&
		siteRulesContainer
	) {
		return true;
	}

	if (!document) {
		return false;
	}

	durationInput ??= document.querySelector<HTMLSelectElement>('select[name="duration"]');
	skipPinnedInput ??= document.querySelector<HTMLInputElement>('input[name="skipPinned"]');
	skipAudibleInput ??= document.querySelector<HTMLInputElement>('input[name="skipAudible"]');
	template ??= document.querySelector('template');
	siteRulesContainer ??= document.querySelector('#site-rules-container');

	return !!(
		durationInput &&
		skipPinnedInput &&
		skipAudibleInput &&
		template &&
		siteRulesContainer
	);
}

function readSettings(): TSettings {
	const global = readGlobalSettings(document.body);
	return normalizeSettings({
		...global,
		siteRules: persistedSettings?.siteRules ?? [],
	});
}

function applySiteListRow(
	node: DocumentFragment,
	rule: TSiteRule,
	index: number,
	total: number,
): DocumentFragment {
	const rowId = `site-rule-row-${index}`;
	const menuId = `site-rule-menu-${index}`;

	const row = node.querySelector<HTMLElement>('#site-rule-row');
	if (row) {
		row.id = rowId;
		row.addEventListener('command', handleSiteRuleCommand);
	}

	const link = node.querySelector('a');
	if (link) {
		link.href = `./site.html?index=${index}`;
		link.title = rule.pattern;
		link.innerHTML = `<span>${rule.pattern}</span><p>Unload ${rule.timeoutMinutes ? `after ${rule.timeoutMinutes}min` : 'never'}.</p>`;
	}

	const menuButton = node.querySelector<HTMLButtonElement>('[command="toggle-popover"]');
	if (menuButton) {
		menuButton.setAttribute('commandfor', menuId);
	}

	const menu = node.querySelector<HTMLElement>('#site-rule-menu');
	if (menu) {
		menu.id = menuId;
		for (const item of Array.from(menu.querySelectorAll<HTMLButtonElement>('[commandfor="site-rule-row"]'))) {
			item.setAttribute('commandfor', rowId);
		}
	}

	const moveUp = node.querySelector<HTMLButtonElement>('[command="--move-up"]');
	if (moveUp) {
		moveUp.hidden = index === 0;
	}

	const moveDown = node.querySelector<HTMLButtonElement>('[command="--move-down"]');
	if (moveDown) {
		moveDown.hidden = index === total - 1;
	}

	return node;
}

async function applySiteRulesMutation(mutate: (settings: TSettings) => TSettings): Promise<void> {
	if (!persistedSettings) {
		return;
	}
	const next = mutate(persistedSettings);
	const saved = await saveSettings(next, persistedSettings);
	if (saved) {
		persistedSettings = saved;
		renderSiteList(saved.siteRules);
	}
}

function siteRuleRowIndex(row: HTMLElement): number | null {
	const match = /^site-rule-row-(\d+)$/.exec(row.id);
	return match ? Number(match[1]) : null;
}

function handleSiteRuleCommand(e: Event): void {
	const event = e as Event & { command: string };
	const row = event.currentTarget as HTMLElement;
	const index = siteRuleRowIndex(row);
	if (index === null || index < 0) {
		return;
	}

	switch (event.command) {
		case '--edit':
			location.href = `./site.html?index=${index}`;
			return;
		case '--move-up':
			void applySiteRulesMutation((settings) => moveSiteRule(settings, index, 'up'));
			return;
		case '--move-down':
			void applySiteRulesMutation((settings) => moveSiteRule(settings, index, 'down'));
			return;
		case '--delete':
			void applySiteRulesMutation((settings) => deleteSiteRule(settings, index));
			return;
	}
}

function renderSiteList(siteRules: TSiteRule[]): void {
	if (!template || !siteRulesContainer) {
		return;
	}

	siteRulesContainer.replaceChildren();
	const fragment = document.createDocumentFragment();
	for (let i = 0; i < siteRules.length; i++) {
		const node = template.content.cloneNode(true) as DocumentFragment;
		fragment.appendChild(applySiteListRow(node, siteRules[i], i, siteRules.length));
	}
	siteRulesContainer.appendChild(fragment);
}

(() => {
	setupEventDelegation();
	void renderSettings();
})();

function setupEventDelegation(): void {
	if (!isDOMReady()) {
		setTimeout(setupEventDelegation, 50);
		return;
	}

	document.body.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'checkbox' && e.target.matches('.switch input[type="checkbox"]')) {
			e.preventDefault();
			e.target.click();
		}
	});

	document.body.addEventListener('change', (e: Event) => {
		if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
			flushSave();
		}

		if (e.target instanceof HTMLSelectElement && e.target.name === 'duration') {
			flushSave();
		}
	});

	document.body.addEventListener('click', (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.tagName === 'BUTTON' && target.getAttribute('name') === 'add') {
			location.href = './site.html?new=1';
		}
	});
}

async function renderSettings(): Promise<void> {
	if (!isDOMReady() || !isBrowserReady()) {
		setTimeout(renderSettings, 50);
		return;
	}

	const settings = await loadSettings();
	applyGlobalSettings(document.body, settings);
	persistedSettings = settings;
	renderSiteList(settings.siteRules);
}

async function persistSettings(): Promise<void> {
	if (!isDOMReady()) {
		return;
	}
	const settings = readSettings();
	const saved = await saveSettings(settings, persistedSettings);
	if (saved) {
		persistedSettings = saved;
	}
}

function flushSave(): void {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
		saveTimeout = undefined;
	}
	void persistSettings();
}

addEventListener('beforeunload', flushSave);
addEventListener('visibilitychange', () => {
	if (document.hidden) {
		flushSave();
	}
});
