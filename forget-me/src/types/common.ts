export type RemovalFlags = {
	removeCookies:      boolean;
	removeDownloads:    boolean;
	removeHistory:      boolean;
	removeIndexedDB:    boolean;
	removeLocalStorage: boolean;
};

export type SiteRule = RemovalFlags & {
	pattern: string;
};

export type Settings = RemovalFlags & {
	siteRules: SiteRule[];
};
