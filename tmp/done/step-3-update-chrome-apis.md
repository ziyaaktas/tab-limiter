# Step 3: Update Chrome APIs

## Objective
Migrate from deprecated MV2 APIs to their MV3 equivalents and modernize the codebase to use Promise-based APIs.

## API Changes Required

### 1. browserAction → action

The `chrome.browserAction` API is renamed to `chrome.action` in MV3.

```javascript
// Before (MV2)
chrome.browserAction.setBadgeText({ text: '5' });
chrome.browserAction.setBadgeBackgroundColor({ color: '#666' });

// After (MV3)
chrome.action.setBadgeText({ text: '5' });
chrome.action.setBadgeBackgroundColor({ color: '#666' });
```

**Locations in background.js to update:**
- `updateBadge()` function uses `browserAction.setBadgeText`

### 2. Callback → Promise Migration

MV3 Chrome APIs support Promises natively. Convert all callback-based calls.

#### chrome.storage.sync.get

```javascript
// Before (callback)
chrome.storage.sync.get(['maxTotal', 'maxWindow'], function(result) {
  console.log(result.maxTotal);
});

// After (Promise/async-await)
const result = await chrome.storage.sync.get(['maxTotal', 'maxWindow']);
console.log(result.maxTotal);
```

#### chrome.storage.sync.set

```javascript
// Before (callback)
chrome.storage.sync.set({ maxTotal: 50 }, function() {
  console.log('Saved');
});

// After (Promise/async-await)
await chrome.storage.sync.set({ maxTotal: 50 });
console.log('Saved');
```

#### chrome.tabs.query

```javascript
// Before (callback)
chrome.tabs.query({ currentWindow: true }, function(tabs) {
  console.log(tabs.length);
});

// After (Promise/async-await)
const tabs = await chrome.tabs.query({ currentWindow: true });
console.log(tabs.length);
```

#### chrome.tabs.remove

```javascript
// Before (callback)
chrome.tabs.remove(tabId, function() {
  console.log('Tab removed');
});

// After (Promise/async-await)
await chrome.tabs.remove(tabId);
console.log('Tab removed');
```

#### chrome.tabs.create

```javascript
// Before (callback)
chrome.tabs.create({ url: 'https://example.com' }, function(tab) {
  console.log('Created tab:', tab.id);
});

// After (Promise/async-await)
const tab = await chrome.tabs.create({ url: 'https://example.com' });
console.log('Created tab:', tab.id);
```

#### chrome.windows.create

```javascript
// Before (callback)
chrome.windows.create({ tabId: tabId }, function(window) {
  console.log('Created window:', window.id);
});

// After (Promise/async-await)
const window = await chrome.windows.create({ tabId: tabId });
console.log('Created window:', window.id);
```

## Functions to Refactor

### getOptions()
```javascript
// Before
function getOptions(callback) {
  chrome.storage.sync.get({
    maxTotal: 50,
    maxWindow: 20,
    // ...defaults
  }, callback);
}

// After
async function getOptions() {
  return chrome.storage.sync.get({
    maxTotal: 50,
    maxWindow: 20,
    exceedTabNewWindow: false,
    displayAlert: true,
    countPinnedTabs: false,
    displayBadge: false,
    alertMessage: 'You have reached your maximum of {maxPlace} tabs...'
  });
}
```

### tabQuery()
```javascript
// Before
function tabQuery(queryInfo, countPinnedTabs, callback) {
  chrome.tabs.query(queryInfo, function(tabs) {
    if (!countPinnedTabs) {
      tabs = tabs.filter(tab => !tab.pinned);
    }
    callback(tabs);
  });
}

// After
async function tabQuery(queryInfo, countPinnedTabs) {
  let tabs = await chrome.tabs.query(queryInfo);
  if (!countPinnedTabs) {
    tabs = tabs.filter(tab => !tab.pinned);
  }
  return tabs;
}
```

### updateBadge()
```javascript
// Before
function updateBadge() {
  getOptions(function(options) {
    if (options.displayBadge) {
      totalRemaining(options, function(remaining) {
        chrome.browserAction.setBadgeText({ text: String(remaining) });
      });
    } else {
      chrome.browserAction.setBadgeText({ text: '' });
    }
  });
}

// After
async function updateBadge() {
  const options = await getOptions();
  if (options.displayBadge) {
    const remaining = await totalRemaining(options);
    await chrome.action.setBadgeText({ text: String(remaining) });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}
```

## options.js Updates

The options page also uses callback-based APIs:

```javascript
// Before
function saveOptions() {
  chrome.storage.sync.set({
    maxTotal: document.getElementById('maxTotal').value,
    // ...
  }, function() {
    // Show status
  });
}

function restoreOptions() {
  chrome.storage.sync.get({
    maxTotal: 50,
    // ...defaults
  }, function(items) {
    document.getElementById('maxTotal').value = items.maxTotal;
    // ...
  });
}

// After
async function saveOptions() {
  await chrome.storage.sync.set({
    maxTotal: document.getElementById('maxTotal').value,
    // ...
  });
  // Show status
}

async function restoreOptions() {
  const items = await chrome.storage.sync.get({
    maxTotal: 50,
    // ...defaults
  });
  document.getElementById('maxTotal').value = items.maxTotal;
  // ...
}
```

## Validation Checklist

- [ ] All `chrome.browserAction` calls replaced with `chrome.action`
- [ ] All callback-based storage calls converted to async/await
- [ ] All callback-based tabs calls converted to async/await
- [ ] All callback-based windows calls converted to async/await
- [ ] options.js updated to use async/await
- [ ] Error handling added with try/catch blocks
- [ ] No remaining callback patterns in codebase
