import browser from 'webextension-polyfill';
import { createStorage, createUseSettings } from 'extension-shared';
import { STORAGE_KEY } from './util';
import type { Settings } from '../types/common';
import { normalizeSettings, settingsEqual } from './settings';

const settingsStorage = createStorage<Settings>({
	key: STORAGE_KEY,
	normalize: normalizeSettings,
	equal: settingsEqual,
});

export async function loadSettings(): Promise<Settings> {
	const response = await browser.storage.local.get(STORAGE_KEY);
	return normalizeSettings(response[STORAGE_KEY]);
}

export const saveSettings = settingsStorage.save;
export const onSettingsChanged = settingsStorage.onChanged;

const legacyAwareStorage = {
	...settingsStorage,
	load: loadSettings,
};

export const useSettings = createUseSettings(legacyAwareStorage);
