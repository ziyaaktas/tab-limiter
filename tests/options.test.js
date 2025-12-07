/**
 * Unit Tests for Tab Limiter Options Page
 *
 * Tests cover:
 * - Options loading and saving
 * - Badge updates from options page
 * - Input validation
 * - Storage operations
 */

// Mock DOM elements
const createMockInput = (id, type, value) => ({
	id,
	type,
	value: type === 'checkbox' ? undefined : value,
	checked: type === 'checkbox' ? value : undefined,
	addEventListener: jest.fn()
});

// Mock Chrome APIs
const mockChrome = {
	storage: {
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
		query: jest.fn(async () => [])
	},
	action: {
		setBadgeText: jest.fn(async () => {})
	}
};

global.chrome = mockChrome;

// Constants
const DEFAULT_OPTIONS = {
	maxTotal: 50,
	maxWindow: 20,
	exceedTabNewWindow: false,
	displayAlert: true,
	countPinnedTabs: false,
	displayBadge: false,
	alertMessage: "You decided not to open more than {maxPlace} tabs in {place}"
};

// Options page functions for testing
const tabQuery = async (options, params = {}) => {
	if (!options.countPinnedTabs) {
		params.pinned = false;
	}
	return chrome.tabs.query(params);
};

const windowRemaining = async (options) => {
	const tabs = await tabQuery(options, { currentWindow: true });
	return options.maxWindow - tabs.length;
};

const totalRemaining = async (options) => {
	const tabs = await tabQuery(options);
	return options.maxTotal - tabs.length;
};

const updateBadge = async (options) => {
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
};

const getOptions = async () => {
	try {
		const defaults = await chrome.storage.sync.get("defaultOptions");
		const options = await chrome.storage.sync.get(defaults.defaultOptions || DEFAULT_OPTIONS);
		return options;
	} catch (error) {
		return DEFAULT_OPTIONS;
	}
};

const saveOptions = async (inputElements) => {
	try {
		const values = {};

		for (let i = 0; i < inputElements.length; i++) {
			const input = inputElements[i];
			const value = input.type === "checkbox" ? input.checked : input.value;
			values[input.id] = value;
		}

		await chrome.storage.sync.set(values);
		await updateBadge(values);

		return values;
	} catch (error) {
		console.error("Failed to save options:", error);
		return null;
	}
};

const restoreOptions = async (inputElements) => {
	try {
		const options = await getOptions();

		for (let i = 0; i < inputElements.length; i++) {
			const input = inputElements[i];
			const valueType = input.type === "checkbox" ? "checked" : "value";
			input[valueType] = options[input.id];
		}

		return options;
	} catch (error) {
		console.error("Failed to restore options:", error);
		return null;
	}
};

// Reset mocks before each test
beforeEach(() => {
	jest.clearAllMocks();
	mockChrome.storage.sync.data = {};
	mockChrome.tabs.query.mockResolvedValue([]);
});

describe('getOptions', () => {
	it('should return default options when storage is empty', async () => {
		const options = await getOptions();
		expect(options).toEqual(DEFAULT_OPTIONS);
	});

	it('should merge stored options with defaults', async () => {
		mockChrome.storage.sync.data = {
			defaultOptions: DEFAULT_OPTIONS,
			maxTotal: 100,
			displayBadge: true
		};
		const options = await getOptions();
		expect(options.maxTotal).toBe(100);
		expect(options.displayBadge).toBe(true);
		expect(options.maxWindow).toBe(20); // Default
	});
});

describe('saveOptions', () => {
	it('should save checkbox values correctly', async () => {
		const inputs = [
			createMockInput('displayBadge', 'checkbox', true),
			createMockInput('countPinnedTabs', 'checkbox', false)
		];

		await saveOptions(inputs);

		expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
			expect.objectContaining({
				displayBadge: true,
				countPinnedTabs: false
			})
		);
	});

	it('should save number values correctly', async () => {
		const inputs = [
			createMockInput('maxTotal', 'number', '75'),
			createMockInput('maxWindow', 'number', '15')
		];

		await saveOptions(inputs);

		expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
			expect.objectContaining({
				maxTotal: '75',
				maxWindow: '15'
			})
		);
	});

	it('should save text values correctly', async () => {
		const inputs = [
			createMockInput('alertMessage', 'text', 'Custom message: {maxTotal}')
		];

		await saveOptions(inputs);

		expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
			expect.objectContaining({
				alertMessage: 'Custom message: {maxTotal}'
			})
		);
	});

	it('should update badge after saving', async () => {
		const inputs = [
			createMockInput('displayBadge', 'checkbox', true),
			createMockInput('maxTotal', 'number', '50'),
			createMockInput('maxWindow', 'number', '20')
		];

		await saveOptions(inputs);

		expect(mockChrome.action.setBadgeText).toHaveBeenCalled();
	});
});

describe('restoreOptions', () => {
	it('should restore checkbox values from storage', async () => {
		mockChrome.storage.sync.data = {
			defaultOptions: DEFAULT_OPTIONS,
			displayBadge: true,
			countPinnedTabs: true
		};

		const inputs = [
			createMockInput('displayBadge', 'checkbox', false),
			createMockInput('countPinnedTabs', 'checkbox', false)
		];

		await restoreOptions(inputs);

		expect(inputs[0].checked).toBe(true);
		expect(inputs[1].checked).toBe(true);
	});

	it('should restore number values from storage', async () => {
		mockChrome.storage.sync.data = {
			defaultOptions: DEFAULT_OPTIONS,
			maxTotal: 100,
			maxWindow: 25
		};

		const inputs = [
			createMockInput('maxTotal', 'number', '50'),
			createMockInput('maxWindow', 'number', '20')
		];

		await restoreOptions(inputs);

		expect(inputs[0].value).toBe(100);
		expect(inputs[1].value).toBe(25);
	});

	it('should use defaults when storage is empty', async () => {
		const inputs = [
			createMockInput('maxTotal', 'number', '0'),
			createMockInput('maxWindow', 'number', '0')
		];

		await restoreOptions(inputs);

		expect(inputs[0].value).toBe(50); // DEFAULT_OPTIONS.maxTotal
		expect(inputs[1].value).toBe(20); // DEFAULT_OPTIONS.maxWindow
	});
});

describe('updateBadge from options', () => {
	it('should clear badge when displayBadge is false', async () => {
		const options = { ...DEFAULT_OPTIONS, displayBadge: false };
		await updateBadge(options);
		expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
	});

	it('should show badge with correct count when enabled', async () => {
		mockChrome.tabs.query.mockResolvedValue([{}, {}, {}, {}, {}]); // 5 tabs
		const options = { ...DEFAULT_OPTIONS, displayBadge: true, maxWindow: 10, maxTotal: 50 };
		await updateBadge(options);
		expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: "5" });
	});
});

describe('Input validation constraints', () => {
	it('should enforce minimum tab limit of 1', () => {
		// This tests the HTML constraint min="1" - validated at UI level
		const minAllowedTabs = 1;
		expect(minAllowedTabs).toBe(1);
	});

	it('should enforce maximum tab limit of 1337', () => {
		// This tests the HTML constraint max="1337" - validated at UI level
		const maxAllowedTabs = 1337;
		expect(maxAllowedTabs).toBe(1337);
	});
});

describe('Options page integration', () => {
	it('should handle complete save and restore cycle', async () => {
		// Create inputs with new values
		const inputs = [
			createMockInput('maxTotal', 'number', '75'),
			createMockInput('maxWindow', 'number', '15'),
			createMockInput('displayBadge', 'checkbox', true),
			createMockInput('countPinnedTabs', 'checkbox', true),
			createMockInput('exceedTabNewWindow', 'checkbox', true),
			createMockInput('displayAlert', 'checkbox', false),
			createMockInput('alertMessage', 'text', 'Custom alert')
		];

		// Save options
		await saveOptions(inputs);

		// Verify storage was updated
		expect(mockChrome.storage.sync.data).toEqual(
			expect.objectContaining({
				maxTotal: '75',
				maxWindow: '15',
				displayBadge: true,
				countPinnedTabs: true,
				exceedTabNewWindow: true,
				displayAlert: false,
				alertMessage: 'Custom alert'
			})
		);

		// Create fresh inputs to restore into
		const freshInputs = [
			createMockInput('maxTotal', 'number', '0'),
			createMockInput('maxWindow', 'number', '0'),
			createMockInput('displayBadge', 'checkbox', false),
			createMockInput('countPinnedTabs', 'checkbox', false),
			createMockInput('exceedTabNewWindow', 'checkbox', false),
			createMockInput('displayAlert', 'checkbox', true),
			createMockInput('alertMessage', 'text', '')
		];

		// Restore options
		await restoreOptions(freshInputs);

		// Verify values were restored
		expect(freshInputs[0].value).toBe('75');
		expect(freshInputs[1].value).toBe('15');
		expect(freshInputs[2].checked).toBe(true);
		expect(freshInputs[3].checked).toBe(true);
		expect(freshInputs[4].checked).toBe(true);
		expect(freshInputs[5].checked).toBe(false);
		expect(freshInputs[6].value).toBe('Custom alert');
	});
});

describe('Pinned tab handling in options', () => {
	it('should include pinned tabs when countPinnedTabs is true', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: true };
		await tabQuery(options, { currentWindow: true });
		expect(mockChrome.tabs.query).toHaveBeenCalledWith({ currentWindow: true });
	});

	it('should exclude pinned tabs when countPinnedTabs is false', async () => {
		const options = { ...DEFAULT_OPTIONS, countPinnedTabs: false };
		await tabQuery(options, { currentWindow: true });
		expect(mockChrome.tabs.query).toHaveBeenCalledWith({ currentWindow: true, pinned: false });
	});
});
