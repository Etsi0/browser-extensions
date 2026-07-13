import { createStorage, createUseSettings } from 'extension-shared';
import { STORAGE_KEY } from './util';
import type { Settings } from '../types/common';
import { normalizeSettings, settingsEqual } from './settings';

const settingsStorage = createStorage<Settings>({
	key: STORAGE_KEY,
	normalize: normalizeSettings,
	equal: settingsEqual,
});

export const loadSettings = settingsStorage.load;
export const saveSettings = settingsStorage.save;
export const onSettingsChanged = settingsStorage.onChanged;
export const useSettings = createUseSettings(settingsStorage);
