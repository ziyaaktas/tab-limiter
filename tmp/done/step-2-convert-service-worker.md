# Step 2: Convert background.js to Service Worker

## Objective
Refactor the background script to work as a service worker, which has different lifecycle characteristics than persistent background pages.

## Key Differences: Background Page vs Service Worker

| Aspect | Background Page (MV2) | Service Worker (MV3) |
|--------|----------------------|---------------------|
| Lifecycle | Persistent, always running | Terminates when idle (~30s) |
| Global state | Persists in memory | Lost on termination |
| DOM access | Has `window`, `document` | No DOM access |
| Event listeners | Can register anytime | Must register synchronously at startup |

## Current Issues in background.js

### 1. Global State Variables (Line ~10-20)
```javascript
var passes = 0;
var countCreatedTabs = 0;
var prevTabCount;
```
These variables will be lost when the service worker terminates.

### 2. Late Event Listener Registration
Event listeners must be registered at the top level, synchronously, on every service worker startup.

### 3. Potential DOM References
Check for any `window` or `document` usage (none found, but verify).

## Required Changes

### 1. Move transient state to chrome.storage.session

```javascript
// Before: Global variables
var passes = 0;
var countCreatedTabs = 0;
var prevTabCount;

// After: Use session storage for transient state
async function getState() {
  const result = await chrome.storage.session.get({
    passes: 0,
    countCreatedTabs: 0,
    prevTabCount: null
  });
  return result;
}

async function setState(updates) {
  await chrome.storage.session.set(updates);
}
```

### 2. Register Event Listeners Synchronously

```javascript
// Event listeners MUST be at the top level and registered synchronously
// They cannot be inside async functions or conditionals

chrome.tabs.onCreated.addListener(handleTabCreated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);

// The handler functions can be async
async function handleTabCreated(tab) {
  // ... implementation
}
```

### 3. Initialize State on Service Worker Startup

```javascript
// Self-invoking async function for initialization
(async () => {
  // Initialize session storage with defaults if needed
  const state = await chrome.storage.session.get(['passes']);
  if (state.passes === undefined) {
    await chrome.storage.session.set({ passes: 0, countCreatedTabs: 0 });
  }

  // Update badge on startup
  await updateBadge();
})();
```

### 4. Handle Service Worker Wake-up

The service worker may wake up in response to an event. Ensure:
- State is reconstructed from storage
- Badge is updated (it persists, but handler needs current data)
- No assumptions about previous execution context

## Code Structure Template

```javascript
// ============================================
// SERVICE WORKER FOR TAB LIMITER (MV3)
// ============================================

// Constants
const DEFAULT_OPTIONS = {
  maxTotal: 50,
  maxWindow: 20,
  // ... etc
};

// ============================================
// EVENT LISTENERS (must be synchronous, top-level)
// ============================================

chrome.tabs.onCreated.addListener(handleTabCreated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
chrome.runtime.onInstalled.addListener(handleInstalled);

// ============================================
// STATE MANAGEMENT
// ============================================

async function getSessionState() {
  return chrome.storage.session.get({
    passes: 0,
    countCreatedTabs: 0,
    prevTabCount: null
  });
}

async function updateSessionState(updates) {
  return chrome.storage.session.set(updates);
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleTabCreated(tab) {
  // Implementation
}

async function handleInstalled(details) {
  // Set default options on first install
  if (details.reason === 'install') {
    await chrome.storage.sync.set(DEFAULT_OPTIONS);
  }
}

// ============================================
// INITIALIZATION
// ============================================

(async () => {
  await updateBadge();
})();
```

## Validation Checklist

- [ ] All event listeners registered at top level synchronously
- [ ] Global variables moved to `chrome.storage.session`
- [ ] No `window` or `document` references
- [ ] Service worker initializes correctly on wake
- [ ] Badge updates correctly after browser restart
- [ ] Tab limiting works after service worker goes idle and wakes
