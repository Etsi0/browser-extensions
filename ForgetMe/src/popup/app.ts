import browser from 'webextension-polyfill';
import { normalizeRule } from 'extension-shared';
import { isBrowserReady, TFilter, TGlobal, DEFAULT_GLOBAL, STORAGE_KEYS, TFilterLegacy, DEFAULT_FILTER } from '../lib/util';
import './input.css';

/*==================================================
	Helper functions
==================================================*/
let template: HTMLTemplateElement | null;
let globalContainer: HTMLElement | null;
let domainContainer: HTMLElement | null;
let saveTimeout: ReturnType<typeof setTimeout> | undefined;

function isDOMReady(): boolean {
	if (template && globalContainer && domainContainer) {
		return true;
	}

	if (!document) {
		return false;
	}

	if (!template) {
		template = document.querySelector('template');
	}

	if (!globalContainer) {
		globalContainer = document.querySelector('#global-container');
	}

	if (!domainContainer) {
		domainContainer = document.querySelector('#domain-container');
	}

	return !!(template && globalContainer && domainContainer);
}

function debounceSave<T extends (...args: any[]) => void>(func: T, delay: number = 300): (...args: Parameters<T>) => void {
	return (...args: Parameters<T>) => {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => func(...args), delay);
	};
}

function getData<T extends TFilter | TGlobal>(container: HTMLElement | null, defaultValue: T): T[] {
	if (!container || !container.children.length) {
		return [defaultValue];
	}

	const hasDomain = 'domain' in defaultValue;
	const rows = container.children;
	const data: T[] = [];

	for (const row of Array.from(rows)) {
		const domainInput = row.querySelector<HTMLInputElement>('input[name="domain"]');
		const rawDomain = domainInput?.value ?? '';
		const domain = hasDomain ? normalizeRule(rawDomain) : undefined;
		if (hasDomain && !domain) {
			continue;
		}

		const removeHistory = row.querySelector<HTMLInputElement>('input[name="removeHistory"]')?.checked || false;
		const removeCookies = row.querySelector<HTMLInputElement>('input[name="removeCookies"]')?.checked || false;
		const removeStorage = row.querySelector<HTMLInputElement>('input[name="removeStorage"]')?.checked || false;
		const removeCache = row.querySelector<HTMLInputElement>('input[name="removeCache"]')?.checked || false;

		data.push(Object.freeze({ ...(hasDomain && { domain }), ...{
			removeHistory,
			removeCookies,
			removeStorage,
			removeCache,
		}} as T));
	}

	return data;
}

/*==================================================
	Initialize popup
==================================================*/
(() => {
	setupEventDelegation();
	renderFilters();
})();

function setupEventDelegation(): void {
	if (!isDOMReady()) {
		setTimeout(setupEventDelegation, 50);
		return;
	}

	document.body.addEventListener('click', (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.tagName === 'BUTTON' && target.getAttribute('name')) {
			switch (target.getAttribute('name')) {
				case 'add':
					if (template && domainContainer) {
						const newNode = template.content.cloneNode(true);
						domainContainer.appendChild(newNode);
						setTimeout(saveFilters, 0);
					}
					break;
			}
		}
	});

	document.body.addEventListener('keydown', (e: KeyboardEvent) => {
		const target = e.target as HTMLElement;
		if (
			e.key === 'Enter' &&
			target instanceof HTMLInputElement &&
			target.type === 'checkbox' &&
			target.matches('.switch input[type="checkbox"]')
		) {
			e.preventDefault();
			target.click();
		}
	});

	document.body.addEventListener('input', (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (
			target instanceof HTMLInputElement &&
			target.name === 'domain'
		) {
			saveFilters();
		}
	});

	document.body.addEventListener('change', (e: Event) => {
		const target = e.target as HTMLElement;
		if (
			target instanceof HTMLInputElement &&
			target.type === 'checkbox'
		) {
			saveFilters();
		}
	});
}

function applyRow<T extends TFilterLegacy | TFilter | TGlobal>(node: DocumentFragment, data: T, defaultValue: T): DocumentFragment {
	const domainInput = node.querySelector<HTMLInputElement>('input[name="domain"]');
	const historyInput = node.querySelector<HTMLInputElement>('input[name="removeHistory"]');
	const cookiesInput = node.querySelector<HTMLInputElement>('input[name="removeCookies"]');
	const storageInput = node.querySelector<HTMLInputElement>('input[name="removeStorage"]');
	const cacheInput = node.querySelector<HTMLInputElement>('input[name="removeCache"]');

	if (domainInput) {
		if ('domain' in data && 'domain' in defaultValue) {
			domainInput.value = data.domain ?? (defaultValue.domain ?? '');
		} else {
			domainInput.closest('label')!.style.display = 'none';
		}
	}

	if (historyInput) {
		historyInput.checked = data.removeHistory ?? (defaultValue.removeHistory ?? false);
	}

	if (cookiesInput) {
		cookiesInput.checked = data.removeCookies ?? (defaultValue.removeCookies ?? false);
	}

	if (storageInput) {
		storageInput.checked = data.removeStorage ?? (defaultValue.removeStorage ?? false);
	}

	if (cacheInput) {
		cacheInput.checked = data.removeCache ?? (defaultValue.removeCache ?? false);
	}

	return node;
}

async function renderFilters(): Promise<void> {
	if (!isDOMReady() || !isBrowserReady()) {
		setTimeout(renderFilters, 50);
		return;
	}

	const response = await browser.storage.local.get(STORAGE_KEYS);
	const global: TGlobal = response.global || DEFAULT_GLOBAL;
	const filters: TFilterLegacy[] = ((response.filters ?? []) as TFilterLegacy[]).map((filter) => ({
		...filter,
		domain: normalizeRule(filter.domain),
	}));

	(() => {
		if (globalContainer!.children.length) {
			globalContainer!.replaceChildren();
		}

		const node = template!.content.cloneNode(true) as DocumentFragment;
		globalContainer!.appendChild(applyRow<TGlobal>(node, global, DEFAULT_GLOBAL));
	})();

	(() => {
		const fragment = document.createDocumentFragment();
		filters.forEach((row) => {
			const node = template!.content.cloneNode(true) as DocumentFragment;
			fragment.appendChild(applyRow<TFilter>(node, row, DEFAULT_FILTER));
		});
		domainContainer!.appendChild(fragment);
	})();
}

/*==================================================
	Save
==================================================*/
const saveFilters = debounceSave(async (): Promise<void> => {
	const filters = getData<TFilter>(domainContainer, DEFAULT_FILTER);
	const global = getData<TGlobal>(globalContainer, DEFAULT_GLOBAL)[0];
	await browser.storage.local.set({ filters, global });
}, 300);

// Save before popup gets closed
addEventListener('beforeunload', saveFilters);
addEventListener('visibilitychange', () => {
	if (document.hidden) {
		saveFilters();
	}
});
