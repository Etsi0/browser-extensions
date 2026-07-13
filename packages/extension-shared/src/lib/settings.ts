export function durationToMinutes(value: string): number | null {
	return value === 'never' ? null : Number(value);
}

export function minutesToDuration(timeoutMinutes: number | null): string {
	return timeoutMinutes === null ? 'never' : String(timeoutMinutes);
}

export function formatTimeout(timeoutMinutes: number | null): string {
	return timeoutMinutes === null ? 'Never' : `After ${timeoutMinutes}min`;
}

export function moveListItem<T>(items: readonly T[], index: number, direction: 'up' | 'down'): T[] {
	const targetIndex = direction === 'up' ? index - 1 : index + 1;
	if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
		return [...items];
	}

	const next = [...items];
	[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
	return next;
}