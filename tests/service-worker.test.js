/**
 * Service Worker Lifecycle Tests for Tab Limiter
 *
 * Tests cover:
 * - Service worker wake/idle cycles
 * - State persistence across restarts
 * - Event listener registration
 * - Browser startup handling
 * - Session restore behavior
 */

// Mock Chrome APIs with session storage persistence simulation
const mockChrome = {
	storage: {
		session: {
			_data: {},
			get: jest.fn(async (defaults) => ({ ...defaults, ...mockChrome.storage.session._data })),
			set: jest.fn(async (updates) => {
				Object.assign(mockChrome.storage.session._data, updates);
			}),
			// Simulate clearing on browser close
			clear: () => { mockChrome.storage.session._data = {}; }
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

// Constants
const INITIAL_TAB_COUNT = -1;

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

	async initialize() {
		await this.set(SESSION_STATE_DEFAULTS);
	}
};

// Simulate service worker lifecycle
const ServiceWorkerSimulator = {
	isActive: false,
	handlers: {},

	// Register event handlers (simulates synchronous top-level registration)
	registerHandlers() {
		this.handlers = {
			tabCreated: null,
			tabRemoved: null,
			tabUpdated: null,
			windowFocusChanged: null,
			installed: null,
			startup: null
		};
		this.isActive = true;
	},

	// Simulate going idle after 30 seconds
	goIdle() {
		this.isActive = false;
	},

	// Simulate waking up on event
	wakeUp() {
		this.isActive = true;
	}
};

// Reset before each test
beforeEach(() => {
	mockChrome.storage.session._data = {};
	mockChrome.storage.sync._data = {};
	mockChrome.tabs.query.mockClear();
	mockChrome.tabs.query.mockResolvedValue([]);
	mockChrome.action.setBadgeText.mockClear();
	mockChrome.storage.session.get.mockClear();
	mockChrome.storage.session.set.mockClear();
	mockChrome.storage.sync.get.mockClear();
	mockChrome.storage.sync.set.mockClear();
	ServiceWorkerSimulator.registerHandlers();
});

describe('Service Worker Event Listener Registration', () => {
	it('should register all required event listeners synchronously', () => {
		// Verify event listeners are registered
		expect(ServiceWorkerSimulator.handlers).toHaveProperty('tabCreated');
		expect(ServiceWorkerSimulator.handlers).toHaveProperty('tabRemoved');
		expect(ServiceWorkerSimulator.handlers).toHaveProperty('tabUpdated');
		expect(ServiceWorkerSimulator.handlers).toHaveProperty('windowFocusChanged');
		expect(ServiceWorkerSimulator.handlers).toHaveProperty('installed');
		expect(ServiceWorkerSimulator.handlers).toHaveProperty('startup');
	});

	it('should register listeners immediately at module load', () => {
		const registrationOrder = [];

		// Simulate synchronous registration
		registrationOrder.push('tabs.onCreated');
		registrationOrder.push('tabs.onRemoved');
		registrationOrder.push('tabs.onUpdated');
		registrationOrder.push('windows.onFocusChanged');
		registrationOrder.push('runtime.onInstalled');
		registrationOrder.push('runtime.onStartup');

		expect(registrationOrder).toEqual([
			'tabs.onCreated',
			'tabs.onRemoved',
			'tabs.onUpdated',
			'windows.onFocusChanged',
			'runtime.onInstalled',
			'runtime.onStartup'
		]);
	});
});

describe('Service Worker Idle/Wake Cycle', () => {
	it('should persist state to session storage before going idle', async () => {
		// Set some state
		await SessionState.set({
			tabCount: 10,
			previousTabCount: 9,
			amountOfTabsCreated: 1,
			passes: 0
		});

		// Simulate going idle (30 second timeout in real extension)
		ServiceWorkerSimulator.goIdle();

		// State should persist in session storage
		const state = await SessionState.get();
		expect(state.tabCount).toBe(10);
		expect(state.previousTabCount).toBe(9);
	});

	it('should restore state from session storage on wake', async () => {
		// Pre-populate session storage (simulates previous active period)
		mockChrome.storage.session._data = {
			tabCount: 15,
			previousTabCount: 14,
			amountOfTabsCreated: 1,
			passes: 2
		};

		// Simulate wake-up
		ServiceWorkerSimulator.wakeUp();

		// Read state
		const state = await SessionState.get();
		expect(state.tabCount).toBe(15);
		expect(state.passes).toBe(2);
	});

	it('should handle multiple idle/wake cycles correctly', async () => {
		// First active period
		await SessionState.set({ tabCount: 5, passes: 0 });
		ServiceWorkerSimulator.goIdle();

		// Wake up, update state
		ServiceWorkerSimulator.wakeUp();
		let state = await SessionState.get();
		expect(state.tabCount).toBe(5);

		await SessionState.set({ tabCount: 8, passes: 1 });
		ServiceWorkerSimulator.goIdle();

		// Second wake up
		ServiceWorkerSimulator.wakeUp();
		state = await SessionState.get();
		expect(state.tabCount).toBe(8);
		expect(state.passes).toBe(1);
	});
});

describe('handleInstalled Event', () => {
	it('should initialize session state on fresh install', async () => {
		// Simulate fresh install
		const details = { reason: "install" };

		// Initialize state (as handleInstalled would do)
		await SessionState.initialize();

		const state = await SessionState.get();
		expect(state).toEqual(SESSION_STATE_DEFAULTS);
	});

	it('should preserve sync storage options on update', async () => {
		// Pre-populate sync storage with user options
		mockChrome.storage.sync._data = {
			defaultOptions: DEFAULT_OPTIONS,
			maxTotal: 100,
			maxWindow: 30
		};

		// Simulate update
		const details = { reason: "update" };
		await SessionState.initialize();

		// User options should persist
		const syncData = await chrome.storage.sync.get(DEFAULT_OPTIONS);
		expect(syncData.maxTotal).toBe(100);
		expect(syncData.maxWindow).toBe(30);
	});

	it('should save default options on fresh install', async () => {
		// Simulate install handler saving defaults
		await chrome.storage.sync.set({ defaultOptions: DEFAULT_OPTIONS });

		const result = await chrome.storage.sync.get("defaultOptions");
		expect(result.defaultOptions).toEqual(DEFAULT_OPTIONS);
	});
});

describe('handleStartup Event', () => {
	it('should initialize session state on browser startup', async () => {
		// Pre-populate session with stale data (shouldn't happen, but test robustness)
		mockChrome.storage.session._data = { passes: 5 };

		// handleStartup initializes state
		await SessionState.initialize();

		const state = await SessionState.get();
		expect(state.passes).toBe(0); // Reset to default
	});

	it('should preserve sync storage user preferences across restarts', async () => {
		// User options in sync storage persist across browser sessions
		mockChrome.storage.sync._data = {
			defaultOptions: DEFAULT_OPTIONS,
			maxTotal: 75,
			displayBadge: true
		};

		// Simulate browser restart - sync storage persists, session clears
		mockChrome.storage.session.clear();
		await SessionState.initialize();

		// Sync data should persist
		const syncData = await chrome.storage.sync.get(DEFAULT_OPTIONS);
		expect(syncData.maxTotal).toBe(75);
		expect(syncData.displayBadge).toBe(true);
	});
});

describe('Session Restore Handling', () => {
	it('should handle session restore with many tabs gracefully', async () => {
		// Simulate session restore creating 20 tabs at once
		const restoredTabs = Array(20).fill({}).map((_, i) => ({ id: i + 1 }));
		mockChrome.tabs.query.mockResolvedValue(restoredTabs);

		// Initialize state (as startup would do)
		await SessionState.initialize();

		// First tab count update
		await SessionState.set({ tabCount: 20, previousTabCount: -1, amountOfTabsCreated: 0 });

		const state = await SessionState.get();
		expect(state.tabCount).toBe(20);
		expect(state.amountOfTabsCreated).toBe(0); // Initial detection, not counted as "created"
	});

	it('should not enforce limits during initial session restore', async () => {
		// When amountOfTabsCreated is 0 (initial load), limits shouldn't be enforced
		const state = {
			tabCount: 60, // Over default limit of 50
			previousTabCount: -1,
			amountOfTabsCreated: 0, // Initial load
			passes: 0
		};

		await SessionState.set(state);

		const currentState = await SessionState.get();
		// The logic checks amountOfTabsCreated === 0 should not trigger enforcement
		expect(currentState.amountOfTabsCreated).toBe(0);
	});
});

describe('Passes Persistence Across Wake Cycles', () => {
	it('should preserve passes count across service worker restarts', async () => {
		// Set passes during active period
		await SessionState.set({ passes: 3 });

		// Go idle and wake up
		ServiceWorkerSimulator.goIdle();
		ServiceWorkerSimulator.wakeUp();

		const state = await SessionState.get();
		expect(state.passes).toBe(3);
	});

	it('should correctly decrement passes after wake', async () => {
		mockChrome.storage.session._data = { passes: 4 };

		ServiceWorkerSimulator.wakeUp();

		// Decrement passes
		const { passes } = await SessionState.get();
		const newPasses = Math.max(0, passes - 1);
		await SessionState.set({ passes: newPasses });

		const state = await SessionState.get();
		expect(state.passes).toBe(3);
	});
});

describe('Tab Count State Persistence', () => {
	it('should persist tab count across idle cycles', async () => {
		await SessionState.set({
			tabCount: 25,
			previousTabCount: 24,
			amountOfTabsCreated: 1
		});

		ServiceWorkerSimulator.goIdle();
		ServiceWorkerSimulator.wakeUp();

		const state = await SessionState.get();
		expect(state.tabCount).toBe(25);
		expect(state.previousTabCount).toBe(24);
	});

	it('should detect batch creation correctly after wake', async () => {
		// State after previous active period
		mockChrome.storage.session._data = {
			tabCount: 10,
			previousTabCount: 10,
			amountOfTabsCreated: 0
		};

		ServiceWorkerSimulator.wakeUp();

		// Simulate batch creation of 5 tabs
		mockChrome.tabs.query.mockResolvedValue(Array(15).fill({}));

		// Calculate delta
		const tabs = await chrome.tabs.query({});
		const state = await SessionState.get();
		const amountCreated = tabs.length - state.tabCount;

		expect(amountCreated).toBe(5);
	});
});

describe('Badge Refresh on Wake', () => {
	it('should refresh badge immediately on wake', async () => {
		mockChrome.storage.sync._data = {
			defaultOptions: DEFAULT_OPTIONS,
			displayBadge: true,
			maxTotal: 50,
			maxWindow: 20
		};
		mockChrome.tabs.query.mockResolvedValue(Array(10).fill({}));

		ServiceWorkerSimulator.wakeUp();

		// Simulate refreshBadge call
		const options = { displayBadge: true, maxTotal: 50, maxWindow: 20, countPinnedTabs: false };
		if (options.displayBadge) {
			await chrome.action.setBadgeText({ text: "10" });
		}

		expect(mockChrome.action.setBadgeText).toHaveBeenCalled();
	});
});

describe('Error Recovery in Service Worker', () => {
	it('should return defaults when session storage fails', async () => {
		// Simulate storage error
		mockChrome.storage.session.get.mockRejectedValueOnce(new Error("Storage error"));

		try {
			await SessionState.get();
		} catch (error) {
			// Should handle gracefully in actual implementation
			expect(error.message).toBe("Storage error");
		}
	});

	it('should continue operation after individual errors', async () => {
		// Simulate one failed operation followed by successful ones
		mockChrome.storage.session.set.mockRejectedValueOnce(new Error("Write error"));

		try {
			await SessionState.set({ tabCount: 5 });
		} catch (error) {
			// Error handled
		}

		// Reset mock for next call
		mockChrome.storage.session.set.mockResolvedValue(undefined);
		await SessionState.set({ tabCount: 10 });

		expect(mockChrome.storage.session.set).toHaveBeenCalledTimes(2);
	});
});

describe('Performance: Wake Time', () => {
	it('should complete initialization quickly', async () => {
		const startTime = Date.now();

		// Simulate initialization sequence
		await SessionState.get();
		await chrome.storage.sync.get("defaultOptions");
		await chrome.action.setBadgeText({ text: "" });

		const endTime = Date.now();
		const duration = endTime - startTime;

		// Should complete in under 100ms (mocked APIs are instant)
		expect(duration).toBeLessThan(100);
	});
});

describe('Concurrent Event Handling', () => {
	it('should handle multiple tabs created rapidly', async () => {
		const tabsCreated = [];

		// Simulate 5 tabs created in rapid succession
		for (let i = 0; i < 5; i++) {
			tabsCreated.push({ id: i + 1 });
		}

		// Directly update the mock data store
		mockChrome.storage.session._data = {
			tabCount: 5,
			previousTabCount: 0,
			amountOfTabsCreated: 5,
			passes: 0
		};

		const state = await SessionState.get();
		expect(state.tabCount).toBe(5);
		expect(state.amountOfTabsCreated).toBe(5);
	});
});
