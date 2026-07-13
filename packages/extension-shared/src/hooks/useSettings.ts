import { useEffect, useRef, useState } from 'preact/hooks';
import type { StorageHandle } from '../lib/storage';

export type UseSettingsResult<T> = {
	settings: T | null;
	update: (next: T) => void;
};

export function createUseSettings<T>(storage: StorageHandle<T>): () => UseSettingsResult<T> {
	return function useSettings(): UseSettingsResult<T> {
		const [settings, setSettings] = useState<T | null>(null);
		const persisted = useRef<T | null>(null);

		const update = (next: T): void => {
			setSettings(next);
			void storage.save(next, persisted.current).then((saved) => {
				persisted.current = saved;
			});
		};

		useEffect(() => {
			let active = true;
			void storage.load().then((loaded) => {
				if (!active) {
					return;
				}

				persisted.current = loaded;
				setSettings(loaded);
			});

			return () => {
				active = false;
			};
		}, []);

		return { settings, update };
	};
}