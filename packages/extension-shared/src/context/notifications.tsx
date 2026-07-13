import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';
import { NOTIFY_AUTO_DISMISS_MS, MAX_VISIBLE } from '../lib/util';
import { NotificationStack } from '../components/notifications';
import type { DismissOptions, NotificationContextValue, NotificationItem, NotifyOptions } from '../types/notifications';

const NotificationContext = createContext<NotificationContextValue | null>(null);
const RaiseStackContext = createContext<(() => void) | null>(null);

export function useRaiseNotificationStack(): () => void {
	return useContext(RaiseStackContext) ?? (() => {});
}

export function useNotifications(): NotificationContextValue {
	const ctx = useContext(NotificationContext);
	if (!ctx) {
		throw new Error('useNotifications must be used within a NotificationProvider');
	}

	return ctx;
}

export function NotificationProvider({ children }: { children: ComponentChildren }) {
	const [items, setItems] = useState<NotificationItem[]>([]);
	const [exitingKeys, setExitingKeys] = useState<Set<string>>(() => new Set());
	const itemsRef = useRef(items);
	const exitingKeysRef = useRef(exitingKeys);
	const autoDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const disposableId = useRef(0);
	const raiseRef = useRef<() => void>(() => {});
	const raiseStack = useCallback(() => raiseRef.current(), []);
	itemsRef.current = items;
	exitingKeysRef.current = exitingKeys;

	const clearAutoDismiss = useCallback((key: string): void => {
		const timer = autoDismissTimers.current.get(key);
		if (timer !== undefined) {
			clearTimeout(timer);
			autoDismissTimers.current.delete(key);
		}
	}, []);

	const completeDismiss = useCallback((key: string): void => {
		clearAutoDismiss(key);
		setItems((prev) => prev.filter((item) => item.key !== key));
		setExitingKeys((prev) => {
			if (!prev.has(key)) {
				return prev;
			}
			const next = new Set(prev);
			next.delete(key);
			return next;
		});
	}, [clearAutoDismiss]);

	const dismiss = useCallback((options: DismissOptions): void => {
		itemsRef.current.forEach((item, index) => {
			if (options.hasActive && !('active' in item)) {
				return;
			}

			const key = item.key;
			if (options.key && key !== options.key) {
				return;
			}

			if (index >= MAX_VISIBLE) {
				completeDismiss(key);
				return;
			}

			setExitingKeys((prev) => {
				if (prev.has(key)) {
					return prev;
				}
				const next = new Set(prev);
				next.add(key);
				return next;
			});
		});
	}, [completeDismiss]);

	const scheduleAutoDismiss = useCallback((key: string, ms: number): void => {
		clearAutoDismiss(key);
		autoDismissTimers.current.set(key, setTimeout(() => dismiss({ key }), ms));
	}, [clearAutoDismiss, dismiss]);

	const notify = useCallback((options: NotifyOptions): string => {
		const keyed = 'key' in options;
		if (keyed && options.active === false) {
			scheduleAutoDismiss(options.key, options.dismissDelay ?? 0);
			return options.key;
		}

		const key = keyed ? options.key : `_${++disposableId.current}`;
		const autoDismissMs = keyed ? options.autoDismissMs : NOTIFY_AUTO_DISMISS_MS;
		setItems((prev) => {
			const item = {
				key,
				revision: 0,
				...options
			};

			if (!keyed) {
				return [item, ...prev];
			}

			const bump = options.bump !== false;
			const wasExiting = exitingKeysRef.current.has(key);
			const index = prev.findIndex((entry) => entry.key === key);

			if (index === -1) {
				return [item, ...prev];
			}

			const existing = prev[index];
			const isFront = index === 0;
			const shouldBump = (bump || wasExiting) && !isFront;
			const nextItem = {
				...item,
				revision: shouldBump ? existing.revision + 1 : existing.revision,
			};

			if (shouldBump) {
				return [nextItem, ...prev.filter((entry) => entry.key !== key)];
			}

			const next = prev.slice();
			next[index] = nextItem;
			return next;
		});

		if (keyed) {
			setExitingKeys((prev) => {
				if (!prev.has(key)) {
					return prev;
				}

				const next = new Set(prev);
				next.delete(key);
				return next;
			});
		}

		if (autoDismissMs !== undefined) {
			scheduleAutoDismiss(key, autoDismissMs);
		} else {
			clearAutoDismiss(key);
		}

		return key;
	}, [clearAutoDismiss, scheduleAutoDismiss]);

	const value = useMemo(() => ({
		notify,
		dismiss,
	}), [notify, dismiss]);

	return (
		<NotificationContext.Provider value={value}>
			<RaiseStackContext.Provider value={raiseStack}>
				<NotificationStack
					items={items}
					exitingKeys={exitingKeys}
					onDismiss={completeDismiss}
					raiseRef={raiseRef}
				/>
				{children}
			</RaiseStackContext.Provider>
		</NotificationContext.Provider>
	);
}
