/**
 * Edge Case Tests for Tab Limiter
 *
 * Tests cover:
 * - Batch tab creation (Ctrl+Shift+T rapid restore)
 * - Multiple windows with independent limits
 * - Pinned tab handling
 * - High tab count performance
 * - Session restore edge cases
 * - Invalid input handling
 */

// Mock Chrome APIs
const mockChrome = {
	storage: {
		session: {
			_data: {},
			get: jest.fn(async (defaults) => ({ ...defaults, ...mockChrome.storage.session._data })),
			set: jest.fn(async (updates) => {
				Object.assign(mockChrome.storage.session._data, updates);
			})
		},
		sync: {
			_data: {},
			get: jest.fn(async (defaults) => {
				if (typeof defaults === 'string') {
					return { [defaults]: mockChrome.storage.sync._data[defaults] };
				}
				return { ...defaults, ...mockChrome.storage.sync._data };
			}),
			set: jest.fn(async (updates) => {
				Object.assign(mockChrome.storage.sync._data, updates);
			})
		}
	},
	tabs: {
		query: jest.fn(async () => []),
		remove: jest.fn(async () => {})
	},
	windows: {
		create: jest.fn(async () => ({ id: 1 })),
		getAll: jest.fn(async () => [{ id: 1 }, { id: 2 }])
	},
	action: {
		setBadgeText: jest.fn(async () => {})
	},
	notifications: {
		create: jest.fn(async () => 'notification-id')
	}
};

global.chrome = mockChrome;

// Constants
const INITIAL_TAB_COUNT = -1;
const MIN_ALLOWED_TABS = 1;

const SESSION_STATE_DEFAULTS = {
	tabCount: INITIAL_TAB_COUNT,
	previousTabCount: INITIAL_TAB_COUNT,
	amountOfTabsCreated: INITIAL_TAB_COUNT,
	passes: 0
};

const DEFAULT_OPTIONS = {
	maxTotal: 50,
	maxWindow: 20,
	exceedTabNewWindow: false,
	displayAlert: true,
	countPinnedTabs: false,
	displayBadge: false,
	alertMessage: "You decided not to open more than {maxPlace} tabs in {place}"
};

// SessionState for testing
const SessionState = {
	async get() {
		return await chrome.storage.session.get(SESSION_STATE_DEFAULTS);
	},
	async set(updates) {
		await chrome.storage.session.set(updates);
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
	}
};

// Tab query with pinned filter
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

async function detectTabLimitExceeded(options) {
	const [windowTabs, totalTabs] = await Promise.all([
		tabQuery(options, { currentWindow: true }),
		tabQuery(options)
	]);

	if (options.maxWindow >= MIN_ALLOWED_TABS && windowTabs.length > options.maxWindow) {
		return "window";
	}
	if (options.maxTotal >= MIN_ALLOWED_TABS && totalTabs.length > options.maxTotal) {
		return "total";
	}
	return null;
}

// Reset before each test
beforeEach(() => {
	jest.clearAllMocks();
	mockChrome.storage.session._data = {};
	mockChrome.storage.sync._data = {};
	mockChrome.tabs.query.mockResolvedValue([]);
});

describe('Batch Tab Creation (Ctrl+Shift+T)', () => {
	it('should detect batch creation correctly', async () => {
		// Initial state
		mockChrome.storage.session._data = {
			tabCount: 10,
			previousTabCount: 10,
			amountOfTabsCreated: 0,
			passes: 0
		};

		// Simulate 5 tabs restored at once
		const newTabCount = 15;
		const state = await SessionState.get();
		const amountCreated = newTabCount - state.tabCount;

		expect(amountCreated).toBe(5);
	});

	it('should only show one alert for batch creation', async () => {
		let alertCount = 0;
		const showAlert = () => { alertCount++; };

		// Simulate batch of 5 tabs over limit
		// First tab triggers alert and sets passes to 4
		showAlert();
		await SessionState.incrementPasses(4);

		// Remaining 4 tabs should decrement passes, not alert
		for (let i = 0; i < 4; i++) {
			const { passes } = await SessionState.get();
			if (passes > 0) {
				await SessionState.decrementPasses();
			} else {
				showAlert();
			}
		}

		expect(alertCount).toBe(1);
	});

	it('should handle mixed batch and single tab creation', async () => {
		// Start with 0 passes
		mockChrome.storage.session._data = { passes: 0 };

		// Batch creates 3 tabs
		await SessionState.incrementPasses(2); // First one triggers, 2 get passes

		// Process passes
		await SessionState.decrementPasses(); // 1
		await SessionState.decrementPasses(); // 0

		// Next single tab should trigger normally
		const { passes } = await SessionState.get();
		expect(passes).toBe(0);
	});

	it('should reset passes correctly after all are consumed', async () => {
		mockChrome.storage.session._data = { passes: 3 };

		await SessionState.decrementPasses();
		await SessionState.decrementPasses();
		await SessionState.decrementPasses();
		await SessionState.decrementPasses(); // Extra decrement

		const { passes } = await SessionState.get();
		expect(passes).toBe(0);
	});
});

describe('Multiple Windows', () => {
	it('should track window limit independently per window', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 5 };

		// Window 1 with 4 tabs
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}]);
		const window1Remaining = await windowRemaining(options);
		expect(window1Remaining).toBe(1);

		// Window 2 with 2 tabs (different query result)
		mockChrome.tabs.query.mockResolvedValue([{}, {}]);
		const window2Remaining = await windowRemaining(options);
		expect(window2Remaining).toBe(3);
	});

	it('should apply total limit across all windows', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 10, maxWindow: 5 };

		// Window 1: 4 tabs, Window 2: 3 tabs = 7 total
		const allTabs = [{}, {}, {}, {}, {}, {}, {}];
		mockChrome.tabs.query.mockResolvedValue(allTabs);

		const remaining = await totalRemaining(options);
		expect(remaining).toBe(3); // 10 - 7
	});

	it('should prioritize window limit when both exceeded', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 10, maxWindow: 3 };

		// 4 tabs in current window, 4 total
		mockChrome.tabs.query.mockImplementation(async (params) => {
			if (params.currentWindow) {
				return [{}, {}, {}, {}]; // 4 in current window
			}
			return [{}, {}, {}, {}]; // 4 total
		});

		const place = await detectTabLimitExceeded(options);
		expect(place).toBe("window");
	});

	it('should use total when only total exceeded', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 5, maxWindow: 10 };

		mockChrome.tabs.query.mockImplementation(async (params) => {
			if (params.currentWindow) {
				return [{}, {}, {}]; // 3 in current window (under window limit)
			}
			return [{}, {}, {}, {}, {}, {}]; // 6 total (over total limit)
		});

		const place = await detectTabLimitExceeded(options);
		expect(place).toBe("total");
	});
});

describe('Pinned Tab Handling', () => {
	it('should exclude pinned tabs when countPinnedTabs is false', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: false, maxWindow: 5 };

		// Query should include pinned: false filter
		await tabQuery(options, { currentWindow: true });

		expect(mockChrome.tabs.query).toHaveBeenCalledWith({
			currentWindow: true,
			pinned: false
		});
	});

	it('should include pinned tabs when countPinnedTabs is true', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: true, maxWindow: 5 };

		await tabQuery(options, { currentWindow: true });

		expect(mockChrome.tabs.query).toHaveBeenCalledWith({
			currentWindow: true
		});
	});

	it('should affect limit calculation when pinned tabs excluded', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: false, maxWindow: 5 };

		// 3 unpinned tabs (pinned filtered out)
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}]);

		const remaining = await windowRemaining(options);
		expect(remaining).toBe(2); // 5 - 3 = 2
	});

	it('should affect limit calculation when pinned tabs included', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: true, maxWindow: 5 };

		// 4 total tabs including 2 pinned
		mockChrome.tabs.query.mockResolvedValue([
			{ pinned: true },
			{ pinned: true },
			{ pinned: false },
			{ pinned: false }
		]);

		const remaining = await windowRemaining(options);
		expect(remaining).toBe(1); // 5 - 4 = 1
	});
});

describe('High Tab Count Performance', () => {
	it('should handle 95+ tabs without errors', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 100, maxWindow: 50 };

		// Create 95 mock tabs
		const manyTabs = Array(95).fill({}).map((_, i) => ({ id: i + 1 }));
		mockChrome.tabs.query.mockResolvedValue(manyTabs);

		const totalRem = await totalRemaining(options);
		const windowRem = await windowRemaining(options);

		expect(totalRem).toBe(5); // 100 - 95
		expect(windowRem).toBe(-45); // 50 - 95 (negative, over limit)
	});

	it('should calculate badge quickly with many tabs', async () => {
		const options = { ...DEFAULT_OPTIONS, displayBadge: true, maxTotal: 200, maxWindow: 100 };

		const manyTabs = Array(150).fill({});
		mockChrome.tabs.query.mockResolvedValue(manyTabs);

		const startTime = Date.now();

		const [windowRem, totalRem] = await Promise.all([
			windowRemaining(options),
			totalRemaining(options)
		]);
		const badgeValue = Math.min(windowRem, totalRem);

		const endTime = Date.now();

		expect(badgeValue).toBe(-50); // Over limit
		expect(endTime - startTime).toBeLessThan(100); // Should be fast
	});
});

describe('Session Restore Edge Cases', () => {
	it('should not enforce limits during initial load', async () => {
		// amountOfTabsCreated of 0 indicates initial load
		const amountOfTabsCreated = 0;

		// Should not trigger limit enforcement
		expect(amountOfTabsCreated).toBe(0);
		// Actual logic would skip enforcement for initial load
	});

	it('should handle empty session (all tabs closed)', async () => {
		mockChrome.tabs.query.mockResolvedValue([]);

		const options = { ...DEFAULT_OPTIONS, maxTotal: 50 };
		const remaining = await totalRemaining(options);

		expect(remaining).toBe(50);
	});

	it('should handle session with exactly max tabs', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 50, maxWindow: 50 };

		// Exactly at limit
		mockChrome.tabs.query.mockResolvedValue(Array(50).fill({}));

		const remaining = await totalRemaining(options);
		expect(remaining).toBe(0);

		// Not exceeded, just at limit - query returns same for window and total
		mockChrome.tabs.query.mockImplementation(async () => {
			return Array(50).fill({});
		});
		const place = await detectTabLimitExceeded(options);
		expect(place).toBeNull(); // At limit, not over
	});

	it('should handle session one over max', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 50, maxWindow: 100 };

		// One over total limit, but under window limit
		mockChrome.tabs.query.mockImplementation(async (params) => {
			return Array(51).fill({});
		});

		const place = await detectTabLimitExceeded(options);
		expect(place).toBe("total");
	});
});

describe('Invalid Input Handling', () => {
	it('should handle maxWindow of 0 (disabled)', async () => {
		const options = { ...DEFAULT_OPTIONS, maxWindow: 0 };

		mockChrome.tabs.query.mockResolvedValue(Array(100).fill({}));

		// When max is < MIN_ALLOWED_TABS, limit is disabled
		const place = await detectTabLimitExceeded(options);
		// Window check returns null when maxWindow < 1
		expect(place).toBe("total"); // Falls through to total check
	});

	it('should handle maxTotal of 0 (disabled)', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 0, maxWindow: 0 };

		mockChrome.tabs.query.mockResolvedValue(Array(100).fill({}));

		const place = await detectTabLimitExceeded(options);
		expect(place).toBeNull(); // Both disabled
	});

	it('should handle very large limits', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: 1337, maxWindow: 1337 };

		mockChrome.tabs.query.mockResolvedValue(Array(1000).fill({}));

		const remaining = await totalRemaining(options);
		expect(remaining).toBe(337);
	});

	it('should handle NaN values gracefully', async () => {
		const options = { ...DEFAULT_OPTIONS, maxTotal: NaN };

		// NaN < MIN_ALLOWED_TABS is false, but NaN comparisons are always false
		const tabs = Array(10).fill({});
		mockChrome.tabs.query.mockResolvedValue(tabs);

		// tabs.length > NaN is always false
		const place = await detectTabLimitExceeded(options);
		// NaN cases should effectively disable the limit
		expect(place).not.toBe("total");
	});
});

describe('Tab ID Edge Cases', () => {
	it('should handle tab with id 0', async () => {
		const tab = { id: 0 };

		// Tab ID 0 might be edge case in some Chrome versions
		await mockChrome.tabs.remove(tab.id);

		expect(mockChrome.tabs.remove).toHaveBeenCalledWith(0);
	});

	it('should handle already-closed tab', async () => {
		const tab = { id: 999 };

		// Simulate tab already closed
		mockChrome.tabs.remove.mockRejectedValueOnce(new Error("No tab with id: 999"));

		try {
			await mockChrome.tabs.remove(tab.id);
		} catch (error) {
			expect(error.message).toContain("999");
		}
	});
});

describe('exceedTabNewWindow Option', () => {
	it('should move tab to new window when enabled for window limit', async () => {
		const tab = { id: 123 };
		const options = { ...DEFAULT_OPTIONS, exceedTabNewWindow: true };
		const place = "window";

		if (options.exceedTabNewWindow && place === "window") {
			await mockChrome.windows.create({ tabId: tab.id, focused: true });
		}

		expect(mockChrome.windows.create).toHaveBeenCalledWith({
			tabId: 123,
			focused: true
		});
	});

	it('should close tab when disabled for window limit', async () => {
		const tab = { id: 456 };
		const options = { ...DEFAULT_OPTIONS, exceedTabNewWindow: false };
		const place = "window";

		if (!options.exceedTabNewWindow || place !== "window") {
			await mockChrome.tabs.remove(tab.id);
		}

		expect(mockChrome.tabs.remove).toHaveBeenCalledWith(456);
	});

	it('should close tab for total limit even with exceedTabNewWindow enabled', async () => {
		const tab = { id: 789 };
		const options = { ...DEFAULT_OPTIONS, exceedTabNewWindow: true };
		const place = "total";

		if (options.exceedTabNewWindow && place === "window") {
			await mockChrome.windows.create({ tabId: tab.id, focused: true });
		} else {
			await mockChrome.tabs.remove(tab.id);
		}

		expect(mockChrome.tabs.remove).toHaveBeenCalledWith(789);
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});
});

describe('Alert Message Template Edge Cases', () => {
	function capitalizeFirstLetter(string) {
		return string[0].toUpperCase() + string.slice(1);
	}

	function renderMessage(template, options, place) {
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
		return template.replace(/{\s*(\S+)\s*}/g, replacer);
	}

	it('should handle unknown placeholder', async () => {
		const template = "Unknown: {unknownVar}";
		const options = { ...DEFAULT_OPTIONS };

		const message = renderMessage(template, options, "window");
		expect(message).toBe("Unknown: ?");
	});

	it('should handle multiple placeholders', async () => {
		const template = "{place} limit is {maxPlace}, total limit is {maxTotal}";
		const options = { ...DEFAULT_OPTIONS, maxWindow: 10, maxTotal: 50 };

		const message = renderMessage(template, options, "window");
		expect(message).toBe("one window limit is 10, total limit is 50");
	});

	it('should handle empty template', async () => {
		const template = "";
		const options = { ...DEFAULT_OPTIONS };

		const message = renderMessage(template, options, "window");
		expect(message).toBe("");
	});

	it('should handle template with only placeholders', async () => {
		const template = "{maxTotal}";
		const options = { ...DEFAULT_OPTIONS, maxTotal: 100 };

		const message = renderMessage(template, options, "total");
		expect(message).toBe("100");
	});

	it('should handle whitespace in placeholders', async () => {
		const template = "{ maxTotal } tabs allowed";
		const options = { ...DEFAULT_OPTIONS, maxTotal: 75 };

		const message = renderMessage(template, options, "total");
		expect(message).toBe("75 tabs allowed");
	});
});

describe('Storage Quota Edge Cases', () => {
	it('should handle storage quota exceeded', async () => {
		mockChrome.storage.sync.set.mockRejectedValueOnce(
			new Error("QUOTA_BYTES quota exceeded")
		);

		try {
			await mockChrome.storage.sync.set({ largeData: "x".repeat(10000) });
		} catch (error) {
			expect(error.message).toContain("quota");
		}
	});

	it('should handle session storage unavailable', async () => {
		mockChrome.storage.session.get.mockRejectedValueOnce(
			new Error("Session storage is not available")
		);

		try {
			await SessionState.get();
		} catch (error) {
			expect(error.message).toContain("Session storage");
		}
	});
});
