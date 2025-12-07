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
	try {
		return await chrome.storage.session.get({
			tabCount: -1,
			previousTabCount: -1,
			amountOfTabsCreated: -1,
			passes: 0
		});
	} catch (error) {
		console.error("Failed to get session state:", error);
		return {
			tabCount: -1,
			previousTabCount: -1,
			amountOfTabsCreated: -1,
			passes: 0
		};
	}
}

async function updateSessionState(updates) {
	try {
		await chrome.storage.session.set(updates);
	} catch (error) {
		console.error("Failed to update session state:", error);
	}
}

// ============================================
// OPTIONS MANAGEMENT
// ============================================
async function getOptions() {
	try {
		const defaults = await chrome.storage.sync.get("defaultOptions");
		const options = await chrome.storage.sync.get(defaults.defaultOptions || DEFAULT_OPTIONS);
		return options;
	} catch (error) {
		console.error("Failed to get options:", error);
		return DEFAULT_OPTIONS;
	}
}

// ============================================
// TAB QUERY UTILITIES
// ============================================
async function tabQuery(options, params = {}) {
	if (!options.countPinnedTabs) {
		params.pinned = false;
	}
	return chrome.tabs.query(params);
}

async function windowRemaining(options) {
	const tabs = await tabQuery(options, { currentWindow: true });
	return options.maxWindow - tabs.length;
}

async function totalRemaining(options) {
	const tabs = await tabQuery(options);
	return options.maxTotal - tabs.length;
}

// ============================================
// BADGE MANAGEMENT
// ============================================
async function updateBadge(options) {
	try {
		if (!options.displayBadge) {
			await chrome.action.setBadgeText({ text: "" });
			return;
		}

		const remaining = await Promise.all([
			windowRemaining(options),
			totalRemaining(options)
		]);
		await chrome.action.setBadgeText({
			text: Math.min(...remaining).toString()
		});
	} catch (error) {
		console.error("Failed to update badge:", error);
	}
}

// ============================================
// TAB COUNT TRACKING
// ============================================
async function updateTabCount() {
	try {
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
	} catch (error) {
		console.error("Failed to update tab count:", error);
		return 0;
	}
}

// ============================================
// TAB LIMIT DETECTION
// ============================================
async function detectTooManyTabsInWindow(options) {
	const tabs = await tabQuery(options, { currentWindow: true });
	if (options.maxWindow < 1) return null;
	if (tabs.length > options.maxWindow) return "window";
	return null;
}

async function detectTooManyTabsInTotal(options) {
	const tabs = await tabQuery(options);
	if (options.maxTotal < 1) return null;
	if (tabs.length > options.maxTotal) return "total";
	return null;
}

async function detectTabLimitExceeded(options) {
	const [windowResult, totalResult] = await Promise.all([
		detectTooManyTabsInWindow(options),
		detectTooManyTabsInTotal(options)
	]);
	return windowResult || totalResult;
}

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

	try {
		await chrome.notifications.create({
			type: 'basic',
			iconUrl: 'icons/48.png',
			title: 'Tab Limiter',
			message: renderedMessage
		});
	} catch (error) {
		console.error("Failed to display notification:", error);
	}
}

// ============================================
// TAB EXCEED HANDLING
// ============================================
async function handleExceedTabs(tab, options, place) {
	try {
		if (options.exceedTabNewWindow && place === "window") {
			await chrome.windows.create({ tabId: tab.id, focused: true });
		} else {
			await chrome.tabs.remove(tab.id);
		}
	} catch (error) {
		console.error("Failed to handle exceed tabs:", error);
	}
}

// ============================================
// EVENT HANDLERS
// ============================================
async function handleInstalled(details) {
	try {
		await chrome.storage.sync.set({ defaultOptions: DEFAULT_OPTIONS });
		await handleUpdate();
	} catch (error) {
		console.error("Failed to handle install:", error);
	}
}

async function handleUpdate() {
	try {
		await updateTabCount();
		const options = await getOptions();
		await updateBadge(options);
	} catch (error) {
		console.error("Failed to handle update:", error);
	}
}

async function handleTabCreated(tab) {
	try {
		const options = await getOptions();
		const place = await detectTabLimitExceeded(options);

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
			await handleExceedTabs(tab, options, place);
			await handleUpdate();
		} else if (amountOfTabsCreated > 1) {
			await updateSessionState({ passes: amountOfTabsCreated - 1 });
		} else if (amountOfTabsCreated === -1) {
			await handleExceedTabs(tab, options, place);
			await handleUpdate();
		}
	} catch (error) {
		console.error("Failed to handle tab created:", error);
	}
}

// ============================================
// INITIALIZATION
// ============================================
(async () => {
	try {
		await handleUpdate();
	} catch (error) {
		console.error("Failed to initialize:", error);
	}
})();
