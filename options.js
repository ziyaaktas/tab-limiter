// ============================================
// OPTIONS PAGE FOR TAB LIMITER (MV3)
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
// TAB QUERY UTILITIES
// ============================================
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

// ============================================
// BADGE MANAGEMENT
// ============================================
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

// ============================================
// OPTIONS MANAGEMENT
// ============================================
let $inputs;

const getOptions = async () => {
	try {
		const defaults = await chrome.storage.sync.get("defaultOptions");
		const options = await chrome.storage.sync.get(defaults.defaultOptions || DEFAULT_OPTIONS);
		return options;
	} catch (error) {
		console.error("Failed to get options:", error);
		return DEFAULT_OPTIONS;
	}
};

const saveOptions = async () => {
	try {
		const values = {};

		for (let i = 0; i < $inputs.length; i++) {
			const input = $inputs[i];
			const value = input.type === "checkbox" ? input.checked : input.value;
			values[input.id] = value;
		}

		await chrome.storage.sync.set(values);

		const status = document.getElementById('status');
		status.className = 'notice';
		status.textContent = 'Options saved.';
		setTimeout(() => {
			status.className += ' invisible';
		}, 100);

		await updateBadge(values);
	} catch (error) {
		console.error("Failed to save options:", error);
	}
};

const restoreOptions = async () => {
	try {
		const options = await getOptions();

		for (let i = 0; i < $inputs.length; i++) {
			const input = $inputs[i];
			const valueType = input.type === "checkbox" ? "checked" : "value";
			input[valueType] = options[input.id];
		}
	} catch (error) {
		console.error("Failed to restore options:", error);
	}
};

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
	$inputs = document.querySelectorAll('#options input');

	await restoreOptions();

	const onChangeInputs = document.querySelectorAll(
		'#options [type="checkbox"], #options [type="number"]'
	);
	const onKeyupInputs = document.querySelectorAll(
		'#options [type="text"], #options [type="number"]'
	);

	for (let i = 0; i < onChangeInputs.length; i++) {
		onChangeInputs[i].addEventListener('change', saveOptions);
	}
	for (let i = 0; i < onKeyupInputs.length; i++) {
		onKeyupInputs[i].addEventListener('keyup', saveOptions);
	}
});
