import browser from 'webextension-polyfill';
import {
	tryCatch,
	isBrowserReady,
	normalizeSettings,
	shouldUnload,
	nextSweepDelayMinutes,
	TSettings,
	STORAGE_KEY,
	ALARM_NAME,
} from './lib/util';

/*==================================================
	Settings
==================================================*/
async function loadSettings(): Promise<TSettings> {
	const response = await browser.storage.local.get(STORAGE_KEY);
	return normalizeSettings(response[STORAGE_KEY]);
}

/*==================================================
	Sweep
==================================================*/
async function clearSweepAlarm(): Promise<void> {
	const [clearError] = await tryCatch(browser.alarms.clear(ALARM_NAME));
	if (clearError) {
		console.error('Error clearing alarm:', clearError);
	}
}

async function scheduleSweep(existingTabs?: browser.Tabs.Tab[]): Promise<void> {
	await clearSweepAlarm();

	const settings = await loadSettings();
	if (!settings.enabled) {
		return;
	}

	let tabs = existingTabs;
	if (!tabs) {
		const [queryError, queried] = await tryCatch(browser.tabs.query({}));
		if (queryError || !queried) {
			console.error('Error querying tabs for schedule:', queryError);
			return;
		}
		tabs = queried;
	}

	const delayInMinutes = nextSweepDelayMinutes(settings, tabs, Date.now());
	if (delayInMinutes === null) {
		return;
	}

	browser.alarms.create(ALARM_NAME, { delayInMinutes });
}

let scheduleDebounce: ReturnType<typeof setTimeout> | undefined;
function requestScheduleSweep(): void {
	if (scheduleDebounce) {
		clearTimeout(scheduleDebounce);
	}
	scheduleDebounce = setTimeout(() => {
		scheduleDebounce = undefined;
		scheduleSweep().catch((error) => console.error('Error scheduling sweep:', error));
	}, 300);
}

async function sweep(): Promise<void> {
	console.log('sweep');

	if (!isBrowserReady()) {
		return;
	}

	const settings = await loadSettings();
	if (!settings.enabled) {
		await clearSweepAlarm();
		return;
	}

	const [queryError, tabs] = await tryCatch(browser.tabs.query({}));
	if (queryError || !tabs) {
		console.error('Error querying tabs:', queryError);
		return;
	}

	const now = Date.now();
	for (const tab of tabs) {
		if (!shouldUnload(tab, settings, now)) {
			continue;
		}

		const [discardError] = await tryCatch(browser.tabs.discard(tab.id!));
		if (discardError) {
			console.debug(`Skipped unloading tab ${tab.id}:`, discardError);
			continue;
		}

		console.log(`Unloaded tab ${tab.id}: ${tab.title ?? tab.url ?? ''}`);
	}

	await scheduleSweep(tabs);
}

/*==================================================
	Main function
==================================================*/
main();
async function main(): Promise<void> {
	if (!isBrowserReady()) {
		setTimeout(main, 50);
		return;
	}

	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === ALARM_NAME) {
			sweep().catch((error) => console.error('Error during sweep:', error));
		}
	});

	browser.tabs.onActivated.addListener(() => requestScheduleSweep());
	browser.tabs.onCreated.addListener(() => requestScheduleSweep());
	browser.tabs.onRemoved.addListener(() => requestScheduleSweep());
	browser.tabs.onUpdated.addListener((_, changeInfo) => {
		if (
			changeInfo.discarded !== undefined ||
			changeInfo.audible   !== undefined ||
			changeInfo.pinned    !== undefined ||
			changeInfo.url       !== undefined
		) {
			requestScheduleSweep();
		}
	});

	browser.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== 'local' || !changes[STORAGE_KEY]) {
			return;
		}

		requestScheduleSweep();
	});

	await scheduleSweep();
}
