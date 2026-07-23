import browser from 'webextension-polyfill';
import { createStorage, createUseSettings } from 'extension-shared';
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from './util';
import type { Settings } from '../types/common';
import { normalizeSettings, settingsEqual } from './settings';
import { migrateSettings } from './migrate';

const settingsStorage = createStorage<Settings>({
	key: STORAGE_KEY,
	normalize: normalizeSettings,
	equal: settingsEqual,
});

export async function loadSettings(): Promise<Settings> {
	const response = await browser.storage.local.get(STORAGE_KEY);
	const stored = response[STORAGE_KEY];
	if (stored != null) {
		const migrated = migrateSettings(stored);
		if (migrated === stored) {
			return normalizeSettings(stored);
		}

		const settings = normalizeSettings(migrated);
		await browser.storage.local.set({ [STORAGE_KEY]: settings });
		return settings;
	}

	const legacy = await browser.storage.local.get([...LEGACY_STORAGE_KEYS]);
	if (LEGACY_STORAGE_KEYS.every((key) => legacy[key] == null)) {
		return normalizeSettings(undefined);
	}

	const global = legacy.global && typeof legacy.global === 'object' ? legacy.global : {};
	const filters = Array.isArray(legacy.filters) ? legacy.filters : [];
	const settings = normalizeSettings(migrateSettings({ ...global as object, siteRules: filters }));

	await browser.storage.local.set({ [STORAGE_KEY]: settings });
	await browser.storage.local.remove([...LEGACY_STORAGE_KEYS]);
	return settings;
}

export const saveSettings = settingsStorage.save;
export const onSettingsChanged = settingsStorage.onChanged;

const legacyAwareStorage = {
	...settingsStorage,
	load: loadSettings,
};

export const useSettings = createUseSettings(legacyAwareStorage);
