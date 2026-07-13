import { DEBOUNCE_MS } from "./util";

type Debounced<T extends (...args: any[]) => void> = ((...args: Parameters<T>) => void) & {
	cancel: () => void;
	flush: () => void;
};

export function debounce<T extends (...args: any[]) => void>(fn: T, ms?: number): Debounced<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: Parameters<T> | undefined;

	const debounced = (...args: Parameters<T>) => {
		if (ms === 0) {
			fn(...args);
			return;
		}

		debounced.cancel();
		lastArgs = args;
		timer = setTimeout(debounced.flush, ms ?? DEBOUNCE_MS);
	};

	debounced.cancel = () => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}

		if (lastArgs !== undefined) {
			lastArgs = undefined;
		}
	};

	debounced.flush = () => {
		if (timer === undefined || lastArgs === undefined) {
			return;
		}

		const args = lastArgs;
		debounced.cancel();
		fn(...args);
	};

	return debounced;
}