/** Per-site override. `timeoutMinutes: null` means never unload matching tabs. */
export type SiteRule = {
	pattern: string;
	timeoutMinutes: number | null;
};

export type Settings = {
	enabled: boolean;
	timeoutMinutes: number;
	skipPinned: boolean;
	skipAudible: boolean;
	siteRules: SiteRule[];
};

/** Resolved unload policy and idle timeout for a single tab. */
export type TabTimeout = {
	unload: boolean;
	timeoutMinutes: number;
};