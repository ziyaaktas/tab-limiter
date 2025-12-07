# Step 4: Handle Service Worker Lifecycle

## Objective
Ensure the extension works correctly despite the service worker's non-persistent nature, handling startup, idle termination, and wake-up scenarios.

## Service Worker Lifecycle Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE WORKER LIFECYCLE                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Install] ──► [Activate] ──► [Running] ──► [Idle] ──► [Terminated]
│                                    │                    │
│                                    │                    │
│                                    ▼                    │
│                              [Event Occurs] ◄───────────┘
│                                    │
│                                    ▼
│                              [Wake Up & Run]
│                                    │
│                                    ▼
│                              [Back to Idle]
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Challenges

### 1. State Persistence
In-memory variables are lost when the service worker terminates (~30 seconds of inactivity).

**Current problematic code:**
```javascript
var passes = 0;           // Lost on termination
var countCreatedTabs = 0; // Lost on termination
var prevTabCount;         // Lost on termination
```

### 2. Event Listener Registration
Event listeners must be registered synchronously at the top level on every startup.

### 3. Initialization Logic
Any setup code must run on every wake-up, not just first install.

## Solutions

### 1. Use chrome.storage.session for Transient State

`chrome.storage.session` is perfect for service worker state:
- Persists across service worker restarts
- Cleared when browser closes
- Fast and synchronous-feeling with async API

```javascript
// State management module
const State = {
  async get() {
    return chrome.storage.session.get({
      passes: 0,
      countCreatedTabs: 0,
      prevTabCount: null,
      lastActiveWindowId: null
    });
  },

  async set(updates) {
    return chrome.storage.session.set(updates);
  },

  async incrementPasses() {
    const { passes } = await this.get();
    await this.set({ passes: passes + 1 });
    return passes + 1;
  },

  async resetPasses() {
    await this.set({ passes: 0 });
  }
};
```

### 2. Synchronous Event Registration Pattern

```javascript
// ✅ CORRECT: Top-level, synchronous registration
chrome.tabs.onCreated.addListener(handleTabCreated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);

// ❌ WRONG: Conditional or delayed registration
async function setup() {
  const options = await getOptions();
  if (options.enableFeature) {
    chrome.tabs.onCreated.addListener(handleTabCreated); // May miss events!
  }
}
```

### 3. Handle runtime.onInstalled and runtime.onStartup

```javascript
// Runs on extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install: set default options
    await chrome.storage.sync.set(DEFAULT_OPTIONS);
    console.log('Tab Limiter installed with default options');
  } else if (details.reason === 'update') {
    // Extension updated: migrate data if needed
    console.log('Tab Limiter updated to version', chrome.runtime.getManifest().version);
  }
});

// Runs when browser starts (with extension already installed)
chrome.runtime.onStartup.addListener(async () => {
  // Reset session state
  await chrome.storage.session.set({
    passes: 0,
    countCreatedTabs: 0,
    prevTabCount: null
  });

  // Update badge
  await updateBadge();
});
```

### 4. Reconstruct State When Needed

Since we can't rely on in-memory state, reconstruct it when needed:

```javascript
async function handleTabCreated(tab) {
  // Get current state from storage
  const state = await State.get();
  const options = await getOptions();

  // Get current tab count (source of truth)
  const tabs = await tabQuery({}, options.countPinnedTabs);
  const currentTabCount = tabs.length;

  // Detect if this is part of a batch creation
  if (state.prevTabCount !== null && currentTabCount > state.prevTabCount + 1) {
    // Multiple tabs created at once (session restore, etc.)
    await State.incrementPasses();
  }

  // Update state
  await State.set({ prevTabCount: currentTabCount });

  // Continue with limit checking...
}
```

### 5. Badge Persistence

The badge text persists across service worker restarts, but ensure it's updated on wake:

```javascript
// Update badge whenever we wake up and process an event
async function ensureBadgeUpdated() {
  const options = await getOptions();
  if (options.displayBadge) {
    const remaining = await totalRemaining(options);
    await chrome.action.setBadgeText({ text: String(remaining) });
  }
}

// Call this in relevant handlers
async function handleTabRemoved(tabId, removeInfo) {
  await ensureBadgeUpdated();
}
```

## Complete Lifecycle Handling Pattern

```javascript
// ============================================
// CONSTANTS & DEFAULTS
// ============================================

const DEFAULT_OPTIONS = {
  maxTotal: 50,
  maxWindow: 20,
  exceedTabNewWindow: false,
  displayAlert: true,
  countPinnedTabs: false,
  displayBadge: false,
  alertMessage: 'Tab limit reached...'
};

// ============================================
// EVENT LISTENERS (synchronous, top-level)
// ============================================

chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onStartup.addListener(onStartup);
chrome.tabs.onCreated.addListener(onTabCreated);
chrome.tabs.onRemoved.addListener(onTabRemoved);
chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);

// ============================================
// LIFECYCLE HANDLERS
// ============================================

async function onInstalled(details) {
  if (details.reason === 'install') {
    await chrome.storage.sync.set(DEFAULT_OPTIONS);
  }
  await initializeSessionState();
  await updateBadge();
}

async function onStartup() {
  await initializeSessionState();
  await updateBadge();
}

async function initializeSessionState() {
  await chrome.storage.session.set({
    passes: 0,
    countCreatedTabs: 0,
    prevTabCount: null
  });
}

// ============================================
// TAB EVENT HANDLERS
// ============================================

async function onTabCreated(tab) {
  try {
    await handleTabCreated(tab);
  } catch (error) {
    console.error('Error handling tab created:', error);
  }
}

// ... other handlers
```

## Validation Checklist

- [ ] `chrome.storage.session` used for transient state
- [ ] All event listeners registered synchronously at top level
- [ ] `runtime.onInstalled` handles first install and updates
- [ ] `runtime.onStartup` initializes state on browser launch
- [ ] Badge updates correctly after service worker wake-up
- [ ] Tab limiting works after idle period (wait 30+ seconds, create tab)
- [ ] No errors in service worker console after wake-up
- [ ] State reconstructed correctly from storage
