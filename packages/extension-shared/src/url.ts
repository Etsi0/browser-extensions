/**
 * Canonicalize a site pattern: lowercase, drop any protocol and trailing
 * slashes so `https://Real.Test/` and `real.test` are treated the same.
 */
export function normalizeRule(rule: string): string {
	return rule
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
		.replace(/\/+$/, '');
}

/**
 * Extract the hostname from a URL. Returns an empty string on parse failure.
 */
export function extractHostname(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
}

function describeUrl(url: string): { hosts: string[]; paths: string[] } {
	const strip = (value: string): string => value.replace(/\/+$/, '');
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();
		const host = parsed.host.toLowerCase();
		const path = (parsed.pathname + parsed.search).toLowerCase();
		const hosts = Array.from(new Set([hostname, host]));
		const paths = Array.from(new Set([strip(hostname + path), strip(host + path)]));
		return { hosts, paths };
	} catch {
		const raw = strip(url.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, ''));
		return { hosts: [raw.split('/')[0]], paths: [raw] };
	}
}

/**
 * Whether a host string matches a domain pattern (exact, subdomain, or port).
 */
export function matchesHost(host: string, domain: string): boolean {
	if (host === domain) {
		return true;
	}

	if (host.endsWith('.' + domain)) {
		return true;
	}

	const colonIndex = host.indexOf(':');
	if (colonIndex !== -1 && host.slice(0, colonIndex) === domain) {
		return true;
	}

	return false;
}

function parseRuleParts(rule: string): { domain: string; pathSuffix: string | null } {
	const slashIndex = rule.indexOf('/');
	if (slashIndex === -1) {
		return { domain: rule, pathSuffix: null };
	}

	return {
		domain: rule.slice(0, slashIndex),
		pathSuffix: rule.slice(slashIndex),
	};
}

function pathSuffixMatches(pathAndSearch: string, suffix: string): boolean {
	if (pathAndSearch === suffix || pathAndSearch.startsWith(suffix)) {
		return true;
	}

	if (suffix.includes('?') && pathAndSearch.startsWith(suffix)) {
		return true;
	}

	return pathAndSearch.startsWith(suffix + '/') || pathAndSearch.startsWith(suffix + '?');
}

function pathMatchesRule(path: string, rule: string): boolean {
	if (path === rule || path.startsWith(rule + '/') || path.startsWith(rule + '?')) {
		return true;
	}

	return rule.includes('?') && path.startsWith(rule);
}

function urlMatchesPathRule(url: string, rule: string): boolean {
	const { domain, pathSuffix } = parseRuleParts(rule);
	if (!pathSuffix) {
		return false;
	}

	const { hosts } = describeUrl(url);
	if (!hosts.some((host) => matchesHost(host, domain))) {
		return false;
	}

	try {
		const parsed = new URL(url);
		const pathAndSearch = (parsed.pathname + parsed.search).toLowerCase();
		return pathSuffixMatches(pathAndSearch, pathSuffix);
	} catch {
		return false;
	}
}

/**
 * Whether a URL matches a site pattern. Matching is host- and path-aware:
 * - `real.test` matches `real.test` and any subdomain like `app.real.test`.
 * - `localhost/maxpa` matches that path and anything beneath it, with or
 *   without a port.
 * - Query strings are included, so `youtube.com/watch?v=` matches watch URLs.
 * - `*` acts as a wildcard, e.g. `*.example.com` or `localhost/api/*`.
 */
export function urlMatchesRule(url: string | undefined, rule: string): boolean {
	if (!url || !rule) {
		return false;
	}

	const { hosts, paths } = describeUrl(url);

	if (rule.includes('*')) {
		const pattern = '^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
		const regex = new RegExp(pattern);
		return paths.some((path) => regex.test(path)) || hosts.some((host) => regex.test(host));
	}

	if (rule.includes('/')) {
		return urlMatchesPathRule(url, rule);
	}

	if (paths.some((path) => pathMatchesRule(path, rule))) {
		return true;
	}

	return hosts.some((host) => matchesHost(host, rule));
}

/**
 * Whether a tab URL can be discarded by the browser. Only regular web pages
 * are discardable; privileged schemes are skipped.
 */
export function isDiscardableUrl(url: string | undefined): boolean {
	if (!url) {
		return false;
	}

	return !['about:', 'moz-extension:', 'chrome:', 'resource:', 'view-source:'].some((scheme) =>
		url.startsWith(scheme),
	);
}
