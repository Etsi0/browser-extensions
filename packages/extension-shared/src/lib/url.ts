import { tryCatch } from './tryCatch';

export type RulePatternFeedback = {
	incompleteRegex?: true;
	invalidRegex?: true;
	invalidUrl?: true;
	strippedParts?: true;
	normalized: string;
};

const REGEX_FLAGS = 'i';
const PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:(?:[\/\\]+|(?=[a-z]))/;
const QUERY_FRAGMENT_REGEX = /[?#].*$/;
const TRAILING_SLASHES_REGEX = /\/+$/;
const NON_DISCARDABLE_PROTOCOLS = new Set([
	'about:',
	'moz-extension:',
	'chrome:',
	'resource:',
	'view-source:',
]);

function isRegex(str: string): boolean {
	return str.length >= 2 && str.startsWith('/') && str.endsWith('/');
}

const ruleRegexCache = new Map<string, RegExp | undefined>();
const ruleUrlCache = new Map<string, URL | undefined>();

function compileRuleRegex(rule: string): RegExp | undefined {
	if (ruleRegexCache.has(rule)) {
		return ruleRegexCache.get(rule);
	}

	const [, regex] = tryCatch(() => new RegExp(rule.slice(1, -1), REGEX_FLAGS));
	ruleRegexCache.set(rule, regex ?? undefined);
	return regex ?? undefined;
}

function parseRuleUrl(rule: string): URL | undefined {
	if (ruleUrlCache.has(rule)) {
		return ruleUrlCache.get(rule);
	}

	const url = parseUrl(`http://${rule}`);
	ruleUrlCache.set(rule, url);
	return url;
}

/**
 * @example ` https://example.com/?foo=bar#baz ` -> `example.com`
 */
export function normalizeRule(rule: string): string {
	const trimmed = rule.trim();
	if (isRegex(trimmed)) {
		return trimmed;
	}

	return trimmed
		.toLowerCase()
		.replace(PROTOCOL_REGEX, '')
		.replace(QUERY_FRAGMENT_REGEX, '')
		.replace(TRAILING_SLASHES_REGEX, '');
}

/**
 * Whether a URL matches a site pattern:
 * - `/pattern/` is tested as a regex against host and host+path strings.
 * - otherwise the rule is parsed as a URL (`http://${rule}`) and matched with
 *   subdomain, optional port, and path-prefix semantics.
 * @example `real.test` matches `app.real.test`; `localhost:3000/api` matches that path with port.
 */
export function urlMatchesRule(url: URL, rule: string): boolean {
	if (!rule) {
		return false;
	}

	if (isRegex(rule)) {
		const regex = compileRuleRegex(rule);
		if (!regex) {
			return false;
		}

		const strip = (value: string): string => value.replace(TRAILING_SLASHES_REGEX, '');
		const hostname = url.hostname;
		const host = url.host;
		const path = url.pathname;
		const array = Array.from(new Set([hostname, host, strip(hostname + path), strip(host + path)]));
		return array.some((target) => regex.test(target));
	}

	const ruleUrl = parseRuleUrl(rule);
	if (!ruleUrl) {
		return false;
	}

	if (url.hostname !== ruleUrl.hostname && !url.hostname.endsWith('.' + ruleUrl.hostname)) {
		return false;
	}

	if (ruleUrl.port && url.port !== ruleUrl.port) {
		return false;
	}

	const path = url.pathname.toLowerCase();
	const rulePath = ruleUrl.pathname.toLowerCase();
	if (rulePath === '/' || rulePath === '') {
		return true;
	}

	return path === rulePath || path.startsWith(rulePath + '/');
}

export function isDiscardableUrl(url: URL): boolean {
	return !NON_DISCARDABLE_PROTOCOLS.has(url.protocol);
}

export function parseUrl(href: string | undefined): URL | undefined {
	if (!href) {
		return undefined;
	}

	const [, url] = tryCatch(() => new URL(href));
	return url ?? undefined;
}

/** Validation and normalization feedback for a site-rule pattern input. */
export function getRulePatternFeedback(raw: string): RulePatternFeedback {
	const feedback: RulePatternFeedback = {
		incompleteRegex: undefined,
		invalidRegex: undefined,
		invalidUrl: undefined,
		strippedParts: undefined,
		normalized: '',
	}

	const trimmed = raw.trim();
	feedback.normalized = trimmed;
	if (!trimmed) {
		return feedback;
	}

	if (trimmed.startsWith('/') && !trimmed.endsWith('/')) {
		feedback.incompleteRegex = true;
		return feedback;
	}

	if (isRegex(trimmed)) {
		const [, regex] = tryCatch(() => new RegExp(trimmed.slice(1, -1), REGEX_FLAGS));
		if (!regex) feedback.invalidRegex = true;
		return feedback;
	}

	const normalized = normalizeRule(trimmed);
	feedback.normalized = normalized;
	if (!normalized) {
		feedback.invalidUrl = true;
		return feedback;
	}

	const ruleUrl = parseUrl(`http://${normalized}`);
	if (!ruleUrl?.hostname) {
		feedback.invalidUrl = true;
		return feedback;
	}

	if (PROTOCOL_REGEX.test(trimmed) || QUERY_FRAGMENT_REGEX.test(trimmed) || TRAILING_SLASHES_REGEX.test(trimmed)) {
		feedback.strippedParts = true;
		return feedback;
	}

	return feedback;
}