/** Split the legacy combined `removeStorage` flag; explicit new flags win. */
function splitRemoveStorage(raw: Record<string, unknown>): Record<string, unknown> {
	if (typeof raw.removeStorage !== 'boolean') {
		return raw;
	}

	const { removeStorage, ...rest } = raw;
	return { removeIndexedDB: removeStorage, removeLocalStorage: removeStorage, ...rest };
}

/** Migrate a stored value to the current shape; returns the input unchanged when current. */
export function migrateSettings(stored: unknown): unknown {
	if (!stored || typeof stored !== 'object') {
		return stored;
	}

	const raw = stored as Record<string, unknown>;
	const rawRules = Array.isArray(raw.siteRules) ? raw.siteRules as unknown[] : undefined;

	const flags = splitRemoveStorage(raw);
	const rules = rawRules?.map((rule) =>
		rule && typeof rule === 'object' ? splitRemoveStorage(rule as Record<string, unknown>) : rule,
	);

	const rulesChanged = rules !== undefined && rules.some((rule, index) => rule !== rawRules?.[index]);
	if (flags === raw && !rulesChanged) {
		return stored;
	}

	return rulesChanged ? { ...flags, siteRules: rules } : flags;
}