// ============================================
// SERVICE WORKER FOR TAB LIMITER (MV3)
// ============================================

// ============================================
// CONSTANTS
// ============================================
const DEFAULT_OPTIONS = {
	maxTotal: 50,
	maxWindow: 20,
	exceedTabNewWindow: false,
	displayAlert: true,
	countPinnedTabs: false,
	displayBadge: false,
	alertMessage: "You decided not to open more than {maxPlace} tabs in {place}"
};

// ============================================
// EVENT LISTENERS (must be synchronous, top-level)
// ============================================
chrome.tabs.onCreated.addListener(handleTabCreated);
chrome.tabs.onRemoved.addListener(handleUpdate);
chrome.tabs.onUpdated.addListener(handleUpdate);
chrome.windows.onFocusChanged.addListener(handleUpdate);
chrome.runtime.onInstalled.addListener(handleInstalled);

// ============================================
// STATE MANAGEMENT
// ============================================
async function getSessionState() {
	return chrome.storage.session.get({
		tabCount: -1,
		previousTabCount: -1,
		amountOfTabsCreated: -1,
		passes: 0
	});
}

async function updateSessionState(updates) {
	return chrome.storage.session.set(updates);
}

// ============================================
// OPTIONS MANAGEMENT
// ============================================
const getOptions = () => new Promise((res) => {
	chrome.storage.sync.get("defaultOptions", (defaults) => {
		chrome.storage.sync.get(defaults.defaultOptions || DEFAULT_OPTIONS, (options) => {
			res(options);
		});
	});
});

// ============================================
// TAB QUERY UTILITIES
// ============================================
const tabQuery = (options, params = {}) => new Promise(res => {
	if (!options.countPinnedTabs) params.pinned = false;
	chrome.tabs.query(params, tabs => res(tabs));
});

const windowRemaining = options =>
	tabQuery(options, { currentWindow: true })
		.then(tabs => options.maxWindow - tabs.length);

const totalRemaining = options =>
	tabQuery(options)
		.then(tabs => options.maxTotal - tabs.length);

// ============================================
// BADGE MANAGEMENT
// ============================================
const updateBadge = async (options) => {
	if (!options.displayBadge) {
		await chrome.action.setBadgeText({ text: "" });
		return;
	}

	const remaining = await Promise.all([windowRemaining(options), totalRemaining(options)]);
	await chrome.action.setBadgeText({
		text: Math.min(...remaining).toString()
	});
};

// ============================================
// TAB COUNT TRACKING
// ============================================
async function updateTabCount() {
	const tabs = await chrome.tabs.query({});
	const state = await getSessionState();

	if (tabs.length === state.tabCount) {
		return state.amountOfTabsCreated;
	}

	const previousTabCount = state.tabCount;
	const tabCount = tabs.length;
	const amountOfTabsCreated = previousTabCount !== -1 ? tabCount - previousTabCount : 0;

	await updateSessionState({
		previousTabCount,
		tabCount,
		amountOfTabsCreated
	});

	return amountOfTabsCreated;
}

// ============================================
// TAB LIMIT DETECTION
// ============================================
const detectTooManyTabsInWindow = options => new Promise(res => {
	tabQuery(options, { currentWindow: true }).then(tabs => {
		if (options.maxWindow < 1) return;
		if (tabs.length > options.maxWindow) res("window");
	});
});

const detectTooManyTabsInTotal = options => new Promise(res => {
	tabQuery(options).then(tabs => {
		if (options.maxTotal < 1) return;
		if (tabs.length > options.maxTotal) res("total");
	});
});

// ============================================
// NOTIFICATION (replaces alert())
// ============================================
function capitalizeFirstLetter(string) {
	return string[0].toUpperCase() + string.slice(1);
}

async function displayAlert(options, place) {
	if (!options.displayAlert) return false;

	const replacer = (match, p1) => {
		switch (p1) {
			case "place":
			case "which":
				return place === "window" ? "one window" : "total";
			case "maxPlace":
			case "maxWhich":
				return options["max" + capitalizeFirstLetter(place)];
			default:
				return options[p1] || "?";
		}
	};

	const renderedMessage = options.alertMessage.replace(
		/{\s*(\S+)\s*}/g,
		replacer
	);

	await chrome.notifications.create({
		type: 'basic',
		iconUrl: 'icons/48.png',
		title: 'Tab Limiter',
		message: renderedMessage
	});
}

// ============================================
// TAB EXCEED HANDLING
// ============================================
const handleExceedTabs = (tab, options, place) => {
	if (options.exceedTabNewWindow && place === "window") {
		chrome.windows.create({ tabId: tab.id, focused: true });
	} else {
		chrome.tabs.remove(tab.id);
	}
};

// ============================================
// EVENT HANDLERS
// ============================================
async function handleInstalled(details) {
	await chrome.storage.sync.set({ defaultOptions: DEFAULT_OPTIONS });
	await handleUpdate();
}

async function handleUpdate() {
	await updateTabCount();
	const options = await getOptions();
	await updateBadge(options);
}

async function handleTabCreated(tab) {
	const options = await getOptions();

	const place = await Promise.race([
		detectTooManyTabsInWindow(options),
		detectTooManyTabsInTotal(options)
	]).catch(() => null);

	if (!place) {
		await handleUpdate();
		return;
	}

	const amountOfTabsCreated = await updateTabCount();
	const state = await getSessionState();

	if (state.passes > 0) {
		await updateSessionState({ passes: state.passes - 1 });
		return;
	}

	await displayAlert(options, place);

	if (amountOfTabsCreated === 1) {
		handleExceedTabs(tab, options, place);
		await handleUpdate();
	} else if (amountOfTabsCreated > 1) {
		await updateSessionState({ passes: amountOfTabsCreated - 1 });
	} else if (amountOfTabsCreated === -1) {
		handleExceedTabs(tab, options, place);
		await handleUpdate();
	}
}

// ============================================
// INITIALIZATION
// ============================================
(async () => {
	await handleUpdate();
})();
