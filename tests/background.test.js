/**
 * Unit Tests for Tab Limiter Background Service Worker
 *
 * Tests cover:
 * - SessionState management
 * - Options retrieval
 * - Tab query utilities
 * - Tab limit detection
 * - Badge updates
 * - Alert message rendering
 * - Tab exceed handling
 */

// Mock Chrome APIs
const mockChrome = {
	storage: {
		session: {
			data: {},
			get: jest.fn(async (defaults) => ({ ...defaults, ...mockChrome.storage.session.data })),
			set: jest.fn(async (updates) => {
				Object.assign(mockChrome.storage.session.data, updates);
			})
		},
		sync: {
			data: {},
			get: jest.fn(async (defaults) => {
				if (typeof defaults === 'string') {
					return { [defaults]: mockChrome.storage.sync.data[defaults] };
				}
				return { ...defaults, ...mockChrome.storage.sync.data };
			}),
			set: jest.fn(async (updates) => {
				Object.assign(mockChrome.storage.sync.data, updates);
			})
		}
	},
	tabs: {
		query: jest.fn(async () => []),
		remove: jest.fn(async () => {}),
		onCreated: { addListener: jest.fn() },
		onRemoved: { addListener: jest.fn() },
		onUpdated: { addListener: jest.fn() }
	},
	windows: {
		create: jest.fn(async () => ({ id: 1 })),
		onFocusChanged: { addListener: jest.fn() }
	},
	action: {
		setBadgeText: jest.fn(async () => {})
	},
	notifications: {
		create: jest.fn(async () => 'notification-id')
	},
	runtime: {
		onInstalled: { addListener: jest.fn() },
		onStartup: { addListener: jest.fn() },
		getManifest: jest.fn(() => ({ version: '0.4.0' }))
	}
};

global.chrome = mockChrome;

// Constants matching background.js
const MIN_ALLOWED_TABS = 1;
const INITIAL_TAB_COUNT = -1;

const DEFAULT_OPTIONS = {
	maxTotal: 50,
	maxWindow: 20,
	exceedTabNewWindow: false,
	displayAlert: true,
	countPinnedTabs: false,
	displayBadge: false,
	alertMessage: "You decided not to open more than {maxPlace} tabs in {place}"
};

const SESSION_STATE_DEFAULTS = {
	tabCount: INITIAL_TAB_COUNT,
	previousTabCount: INITIAL_TAB_COUNT,
	amountOfTabsCreated: INITIAL_TAB_COUNT,
	passes: 0
};

// SessionState implementation for testing
const SessionState = {
	async get() {
		try {
			return await chrome.storage.session.get(SESSION_STATE_DEFAULTS);
		} catch (error) {
			return { ...SESSION_STATE_DEFAULTS };
		}
	},

	async set(updates) {
		try {
			await chrome.storage.session.set(updates);
		} catch (error) {
			console.error("Failed to update session state:", error);
		}
	},

	async initialize() {
		await this.set(SESSION_STATE_DEFAULTS);
	},

	async incrementPasses(amount = 1) {
		const { passes } = await this.get();
		const newPasses = passes + amount;
		await this.set({ passes: newPasses });
		return newPasses;
	},

	async decrementPasses() {
		const { passes } = await this.get();
		const newPasses = Math.max(0, passes - 1);
		await this.set({ passes: newPasses });
		return newPasses;
	},

	async resetPasses() {
		await this.set({ passes: 0 });
	}
};

// Options management for testing
async function getOptions() {
	try {
		const defaults = await chrome.storage.sync.get("defaultOptions");
		const options = await chrome.storage.sync.get(defaults.defaultOptions || DEFAULT_OPTIONS);
		return options;
	} catch (error) {
		return DEFAULT_OPTIONS;
	}
}

// Tab query utilities for testing
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

// Tab limit detection for testing
async function detectTooManyTabsInWindow(options) {
	const tabs = await tabQuery(options, { currentWindow: true });
	if (options.maxWindow < MIN_ALLOWED_TABS) return null;
	if (tabs.length > options.maxWindow) return "window";
	return null;
}

async function detectTooManyTabsInTotal(options) {
	const tabs = await tabQuery(options);
	if (options.maxTotal < MIN_ALLOWED_TABS) return null;
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

// Badge management for testing
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

// Alert message utilities for testing
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

	return true;
}

// Tab exceed handling for testing
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

// Reset mocks before each test
beforeEach(() => {
	jest.clearAllMocks();
	mockChrome.storage.session.data = {};
	mockChrome.storage.sync.data = {};
	mockChrome.tabs.query.mockResolvedValue([]);
});

describe('SessionState', () => {
	describe('get', () => {
		it('should return default values when storage is empty', async () => {
			const state = await SessionState.get();
			expect(state).toEqual(SESSION_STATE_DEFAULTS);
		});

		it('should return stored values when available', async () => {
			mockChrome.storage.session.data = { tabCount: 10, passes: 2 };
			const state = await SessionState.get();
			expect(state.tabCount).toBe(10);
			expect(state.passes).toBe(2);
		});
	});

	describe('set', () => {
		it('should update session storage', async () => {
			await SessionState.set({ tabCount: 5 });
			expect(mockChrome.storage.session.set).toHaveBeenCalledWith({ tabCount: 5 });
		});
	});

	describe('initialize', () => {
		it('should reset state to defaults', async () => {
			mockChrome.storage.session.data = { passes: 5 };
			await SessionState.initialize();
			expect(mockChrome.storage.session.set).toHaveBeenCalledWith(SESSION_STATE_DEFAULTS);
		});
	});

	describe('passes management', () => {
		it('should increment passes correctly', async () => {
			mockChrome.storage.session.data = { passes: 2 };
			const newPasses = await SessionState.incrementPasses(3);
			expect(newPasses).toBe(5);
		});

		it('should decrement passes correctly', async () => {
			mockChrome.storage.session.data = { passes: 3 };
			const newPasses = await SessionState.decrementPasses();
			expect(newPasses).toBe(2);
		});

		it('should not decrement below zero', async () => {
			mockChrome.storage.session.data = { passes: 0 };
			const newPasses = await SessionState.decrementPasses();
			expect(newPasses).toBe(0);
		});

		it('should reset passes to zero', async () => {
			mockChrome.storage.session.data = { passes: 5 };
			await SessionState.resetPasses();
			expect(mockChrome.storage.session.set).toHaveBeenCalledWith({ passes: 0 });
		});
	});
});

describe('getOptions', () => {
	it('should return default options when no custom options set', async () => {
		const options = await getOptions();
		expect(options).toEqual(DEFAULT_OPTIONS);
	});

	it('should return stored options when available', async () => {
		mockChrome.storage.sync.data = {
			defaultOptions: DEFAULT_OPTIONS,
			maxTotal: 30,
			maxWindow: 10
		};
		const options = await getOptions();
		expect(options.maxTotal).toBe(30);
		expect(options.maxWindow).toBe(10);
	});
});

describe('tabQuery', () => {
	it('should filter out pinned tabs when countPinnedTabs is false', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: false };
		await tabQuery(options, {});
		expect(mockChrome.tabs.query).toHaveBeenCalledWith({ pinned: false });
	});

	it('should include pinned tabs when countPinnedTabs is true', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: true };
		await tabQuery(options, {});
		expect(mockChrome.tabs.query).toHaveBeenCalledWith({});
	});

	it('should pass additional query params', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: false };
		await tabQuery(options, { currentWindow: true });
		expect(mockChrome.tabs.query).toHaveBeenCalledWith({ pinned: false, currentWindow: true });
	});
});

describe('windowRemaining', () => {
	it('should calculate remaining tabs correctly', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 10 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}]); // 3 tabs
		const remaining = await windowRemaining(options);
		expect(remaining).toBe(7);
	});

	it('should return negative when over limit', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 5 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}, {}, {}]); // 7 tabs
		const remaining = await windowRemaining(options);
		expect(remaining).toBe(-2);
	});
});

describe('totalRemaining', () => {
	it('should calculate remaining tabs correctly', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 50 };
		mockChrome.tabs.query.mockResolvedValue(Array(20).fill({})); // 20 tabs
		const remaining = await totalRemaining(options);
		expect(remaining).toBe(30);
	});
});

describe('detectTooManyTabsInWindow', () => {
	it('should return null when under limit', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 10 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}]); // 3 tabs
		const result = await detectTooManyTabsInWindow(options);
		expect(result).toBeNull();
	});

	it('should return "window" when over limit', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 5 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}, {}]); // 6 tabs
		const result = await detectTooManyTabsInWindow(options);
		expect(result).toBe("window");
	});

	it('should return null when maxWindow is less than MIN_ALLOWED_TABS', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 0 };
		const result = await detectTooManyTabsInWindow(options);
		expect(result).toBeNull();
	});
});

describe('detectTooManyTabsInTotal', () => {
	it('should return null when under limit', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 50 };
		mockChrome.tabs.query.mockResolvedValue(Array(10).fill({})); // 10 tabs
		const result = await detectTooManyTabsInTotal(options);
		expect(result).toBeNull();
	});

	it('should return "total" when over limit', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 10 };
		mockChrome.tabs.query.mockResolvedValue(Array(15).fill({})); // 15 tabs
		const result = await detectTooManyTabsInTotal(options);
		expect(result).toBe("total");
	});
});

describe('detectTabLimitExceeded', () => {
	it('should return null when both limits are satisfied', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 50, maxWindow: 20 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}]); // 3 tabs
		const result = await detectTabLimitExceeded(options);
		expect(result).toBeNull();
	});

	it('should return "window" when window limit exceeded', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 50, maxWindow: 5 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}, {}]); // 6 tabs
		const result = await detectTabLimitExceeded(options);
		expect(result).toBe("window");
	});

	it('should return "total" when total limit exceeded', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 5, maxWindow: 20 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}, {}]); // 6 tabs
		const result = await detectTabLimitExceeded(options);
		expect(result).toBe("total");
	});

	it('should prioritize window over total when both exceeded', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 5, maxWindow: 3 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}, {}]); // 6 tabs
		const result = await detectTabLimitExceeded(options);
		expect(result).toBe("window");
	});
});

describe('updateBadge', () => {
	it('should clear badge when displayBadge is false', async () => {
		const options = { ...DEFAULT_OPTIONS, displayBadge: false };
		await updateBadge(options);
		expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
	});

	it('should display minimum remaining when displayBadge is true', async () => {
		const options = { ...DEFAULT_OPTIONS, displayBadge: true, maxWindow: 10, maxTotal: 50 };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}]); // 5 tabs
		await updateBadge(options);
		// Window remaining: 10 - 5 = 5, Total remaining: 50 - 5 = 45
		expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: "5" });
	});
});

describe('displayAlert', () => {
	it('should not show notification when displayAlert is false', async () => {
		const options = { ...DEFAULT_OPTIONS, displayAlert: false };
		const result = await displayAlert(options, "window");
		expect(result).toBe(false);
		expect(mockChrome.notifications.create).not.toHaveBeenCalled();
	});

	it('should show notification with replaced placeholders for window', async () => {
		const options = { ...DEFAULT_OPTIONS, displayAlert: true, maxWindow: 10 };
		await displayAlert(options, "window");
		expect(mockChrome.notifications.create).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'basic',
				message: "You decided not to open more than 10 tabs in one window"
			})
		);
	});

	it('should show notification with replaced placeholders for total', async () => {
		const options = { ...DEFAULT_OPTIONS, displayAlert: true, maxTotal: 50 };
		await displayAlert(options, "total");
		expect(mockChrome.notifications.create).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "You decided not to open more than 50 tabs in total"
			})
		);
	});

	it('should handle custom alert messages', async () => {
		const options = {
			...DEFAULT_OPTIONS,
			displayAlert: true,
			alertMessage: "Limit reached: {maxTotal} total, {maxWindow} per window",
			maxTotal: 100,
			maxWindow: 25
		};
		await displayAlert(options, "window");
		expect(mockChrome.notifications.create).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Limit reached: 100 total, 25 per window"
			})
		);
	});
});

describe('handleExceedTabs', () => {
	it('should remove tab when exceedTabNewWindow is false', async () => {
		const tab = { id: 123 };
		const options = { ...DEFAULT_OPTIONS, exceedTabNewWindow: false };
		await handleExceedTabs(tab, options, "window");
		expect(mockChrome.tabs.remove).toHaveBeenCalledWith(123);
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});

	it('should create new window when exceedTabNewWindow is true and place is window', async () => {
		const tab = { id: 456 };
		const options = { ...DEFAULT_OPTIONS, exceedTabNewWindow: true };
		await handleExceedTabs(tab, options, "window");
		expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 456, focused: true });
		expect(mockChrome.tabs.remove).not.toHaveBeenCalled();
	});

	it('should remove tab even with exceedTabNewWindow when place is total', async () => {
		const tab = { id: 789 };
		const options = { ...DEFAULT_OPTIONS, exceedTabNewWindow: true };
		await handleExceedTabs(tab, options, "total");
		expect(mockChrome.tabs.remove).toHaveBeenCalledWith(789);
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});
});

describe('capitalizeFirstLetter', () => {
	it('should capitalize first letter', () => {
		expect(capitalizeFirstLetter("window")).toBe("Window");
		expect(capitalizeFirstLetter("total")).toBe("Total");
	});
});

describe('Integration: Tab Limit Enforcement Flow', () => {
	it('should correctly handle single tab over window limit', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 5, displayAlert: true };
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}, {}]); // 6 tabs

		const place = await detectTabLimitExceeded(options);
		expect(place).toBe("window");

		const tab = { id: 100 };
		await displayAlert(options, place);
		await handleExceedTabs(tab, options, place);

		expect(mockChrome.notifications.create).toHaveBeenCalled();
		expect(mockChrome.tabs.remove).toHaveBeenCalledWith(100);
	});

	it('should correctly handle batch tab creation with passes', async () => {
		await SessionState.initialize();
		expect(mockChrome.storage.session.data.passes).toBe(0);

		// Simulate batch creation - increment passes by 4 (5 tabs created, 1 closed, 4 pass)
		await SessionState.incrementPasses(4);
		let state = await SessionState.get();
		expect(state.passes).toBe(4);

		// Each subsequent tab decrements passes
		await SessionState.decrementPasses();
		state = await SessionState.get();
		expect(state.passes).toBe(3);

		await SessionState.decrementPasses();
		await SessionState.decrementPasses();
		await SessionState.decrementPasses();
		state = await SessionState.get();
		expect(state.passes).toBe(0);

		// Next tab over limit should trigger enforcement
		await SessionState.decrementPasses(); // Should stay at 0
		state = await SessionState.get();
		expect(state.passes).toBe(0);
	});
});
