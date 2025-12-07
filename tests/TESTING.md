# Tab Limiter Test Suite

## Overview

This test suite validates the Chrome Extension Manifest V3 migration for Tab Limiter. The tests cover the core functionality, service worker lifecycle, and edge cases.

## Test Files

### `background.test.js`
Unit tests for the service worker (background.js):
- SessionState management (get, set, initialize, passes)
- Options retrieval with defaults
- Tab query utilities with pinned tab filtering
- Tab limit detection (window and total limits)
- Badge updates
- Alert message rendering with placeholders
- Tab exceed handling (close vs move to new window)

### `options.test.js`
Unit tests for the options page (options.js):
- Options loading from storage
- Options saving to storage
- Checkbox and number input handling
- Badge updates from options page
- Complete save/restore cycle

### `service-worker.test.js`
Service worker lifecycle tests:
- Event listener registration (synchronous, top-level)
- Idle/wake cycles with state persistence
- handleInstalled and handleStartup events
- Session restore handling
- Passes persistence across wake cycles
- Tab count state persistence
- Error recovery

### `edge-cases.test.js`
Edge case coverage:
- Batch tab creation (Ctrl+Shift+T rapid restore)
- Multiple windows with independent limits
- Pinned tab handling (include/exclude)
- High tab count performance (95+ tabs)
- Session restore edge cases
- Invalid input handling (NaN, 0, large values)
- Tab ID edge cases
- exceedTabNewWindow option behavior
- Alert message template edge cases
- Storage quota edge cases

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Architecture

The tests use Jest with mocked Chrome APIs since the extension runs in a Chrome environment. Key mocking patterns:

1. **Chrome Storage**: Both `session` and `sync` storage are mocked with `_data` objects that persist within tests
2. **Chrome Tabs**: `query`, `remove`, and event listeners are mocked
3. **Chrome Windows**: `create` and `onFocusChanged` are mocked
4. **Chrome Action**: `setBadgeText` is mocked
5. **Chrome Notifications**: `create` is mocked

## Test Results Summary

- **Total Tests**: 108
- **Test Suites**: 4 (all passing)

### Coverage Areas

| Area | Tests | Status |
|------|-------|--------|
| SessionState | 8 | ✅ |
| Options | 12 | ✅ |
| Tab Query | 6 | ✅ |
| Tab Limits | 10 | ✅ |
| Badge | 6 | ✅ |
| Alerts | 8 | ✅ |
| Tab Exceed | 6 | ✅ |
| Service Worker | 20 | ✅ |
| Edge Cases | 32 | ✅ |

## Manual Testing Checklist

While automated tests cover unit and integration scenarios, manual testing in Chrome is required for:

### Basic Functionality
- [ ] Extension loads in `chrome://extensions/`
- [ ] No errors in service worker console
- [ ] Options popup opens correctly
- [ ] All settings save and restore

### Tab Limiting
- [ ] Total tab limit enforced
- [ ] Window tab limit enforced
- [ ] Pinned tab setting works
- [ ] Badge displays correctly

### Service Worker Lifecycle
- [ ] Wait 60s, create tab - limits work
- [ ] Close/reopen Chrome - settings persist
- [ ] Session restore handled gracefully

### Edge Cases
- [ ] Ctrl+Shift+T rapid restore
- [ ] 95+ tabs performance
- [ ] Multiple windows

## Chrome Web Store Submission

Before submission:
1. All automated tests pass: `npm test`
2. Manual testing checklist complete
3. No console errors or warnings
4. Performance acceptable (badge updates < 50ms)
