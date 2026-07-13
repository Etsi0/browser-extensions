import browser from 'webextension-polyfill';

export type StorageConfig<T> = {
	key: string;
	normalize: (stored: unknown) => T;
	equal: (a: T, b: T) => boolean;
};

export type StorageHandle<T> = {
	load: () => Promise<T>;
	save: (value: T, previous: T | null) => Promise<T>;
	onChanged: (callback: (value: T) => void) => () => void;
};

export function createStorage<T>(config: StorageConfig<T>): StorageHandle<T> {
	const { key, normalize, equal } = config;

	const load = async (): Promise<T> => {
		const response = await browser.storage.local.get(key);
		return normalize(response[key]);
	};

	const save = async (value: T, previous: T | null): Promise<T> => {
		if (previous && equal(value, previous)) {
			return previous;
		}

		await browser.storage.local.set({ [key]: value });
		return value;
	};

	const onChanged = (callback: (value: T) => void): (() => void) => {
		const listener = (changes: Record<string, browser.Storage.StorageChange>, areaName: string): void => {
			if (areaName !== 'local' || !changes[key]) {
				return;
			}

			callback(normalize(changes[key].newValue));
		};

		browser.storage.onChanged.addListener(listener);
		return () => browser.storage.onChanged.removeListener(listener);
	};

	return { load, save, onChanged };
}