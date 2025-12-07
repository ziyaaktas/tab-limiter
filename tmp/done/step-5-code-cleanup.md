# Step 5: Code Cleanup

## Objective
Remove dead code, standardize patterns, improve error handling, and enhance code quality throughout the extension.

## Issues to Address

### 1. Remove Commented-Out Code

**Location: background.js lines ~35-50**
```javascript
// Remove this entire block of commented code
// function getTabs(options, callback) {
//   tabQuery(
//     {},
//     options.countPinnedTabs,
//     callback
//   )
// }
```

### 2. Remove Firefox Compatibility Shim (Optional)

If targeting Chrome only, remove the cross-browser wrapper:

```javascript
// Before (options.js)
var browser = browser || chrome;

// After (Chrome-only)
// Just use chrome directly
```

**Decision point:** Keep if planning Firefox support via web-ext, remove if Chrome-only.

### 3. Standardize on async/await

Replace mixed patterns with consistent async/await:

```javascript
// Before: Mixed callbacks and promises
function doSomething() {
  getOptions(function(options) {
    tabQuery({}, options.countPinnedTabs, function(tabs) {
      // nested callbacks
    });
  });
}

// After: Clean async/await
async function doSomething() {
  const options = await getOptions();
  const tabs = await tabQuery({}, options.countPinnedTabs);
  // flat, readable code
}
```

### 4. Add Proper Error Handling

Wrap async operations in try/catch:

```javascript
// Before: No error handling
async function handleTabCreated(tab) {
  const options = await getOptions();
  // ... if this fails, error is swallowed
}

// After: Proper error handling
async function handleTabCreated(tab) {
  try {
    const options = await getOptions();
    // ... implementation
  } catch (error) {
    console.error('Failed to handle tab creation:', error);
  }
}
```

### 5. Remove Magic Numbers

```javascript
// Before
document.getElementById('maxTotal').max = 1337;

// After
const MAX_TAB_LIMIT = 1337;
document.getElementById('maxTotal').max = MAX_TAB_LIMIT;
```

### 6. Clean Up Alert Mechanism

Consider replacing `alert()` with a less intrusive notification:

```javascript
// Before: Blocks UI
alert(message);

// Option A: Chrome notification API
async function showNotification(message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/48.png',
    title: 'Tab Limiter',
    message: message
  });
}

// Option B: Badge + console (minimal approach)
async function showLimitWarning(message) {
  console.warn('Tab Limiter:', message);
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
}
```

**Note:** Using notifications requires adding `"notifications"` permission.

### 7. Improve Function Organization

Group related functions and add section comments:

```javascript
// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_OPTIONS = { ... };

// ============================================
// STATE MANAGEMENT
// ============================================

async function getOptions() { ... }
async function getSessionState() { ... }

// ============================================
// TAB QUERIES
// ============================================

async function tabQuery(queryInfo, countPinnedTabs) { ... }
async function windowRemaining(options) { ... }
async function totalRemaining(options) { ... }

// ============================================
// LIMIT ENFORCEMENT
// ============================================

async function detectTooManyTabsInWindow(options) { ... }
async function detectTooManyTabsInTotal(options) { ... }
async function handleExceedTabs(tab, options) { ... }

// ============================================
// UI UPDATES
// ============================================

async function updateBadge() { ... }
async function displayAlert(options, place) { ... }

// ============================================
// EVENT HANDLERS
// ============================================

async function handleTabCreated(tab) { ... }
// ... etc
```

### 8. Remove Unused Variables

Audit and remove any variables that are declared but never used.

### 9. Consistent Naming Conventions

Ensure consistent naming:
- Functions: camelCase, verb-first (`getOptions`, `handleTabCreated`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_OPTIONS`, `MAX_TAB_LIMIT`)
- Variables: camelCase (`tabCount`, `currentWindow`)

### 10. Update Version Date

Remove or update hardcoded date:

```javascript
// Before
// date: '09-20-2020'

// After: Remove or use dynamic version
const VERSION = chrome.runtime.getManifest().version;
```

## Refactored Code Structure

### background.js
```
1-20:    Constants and default options
21-40:   State management functions
41-80:   Tab query and counting functions
81-120:  Limit detection functions
121-160: Limit enforcement functions
161-200: UI update functions (badge, alerts)
201-260: Event handlers
261-280: Event listener registration
281-290: Initialization
```

### options.js
```
1-10:    Constants
11-40:   Save options function
41-80:   Restore options function
81-100:  UI helper functions
101-110: Event listener setup
```

## Validation Checklist

- [ ] All commented-out code removed
- [ ] Consistent use of async/await throughout
- [ ] try/catch error handling in all async functions
- [ ] Magic numbers replaced with named constants
- [ ] Functions organized into logical sections
- [ ] Unused variables removed
- [ ] Consistent naming conventions applied
- [ ] No ESLint/linter warnings
- [ ] Code passes review for readability
