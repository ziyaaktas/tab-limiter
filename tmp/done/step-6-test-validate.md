# Step 6: Test & Validate

## Objective
Thoroughly test all extension functionality to ensure the MV3 migration is complete and working correctly.

## Test Environment Setup

### 1. Load Extension in Developer Mode
1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the extension directory
5. Verify no errors appear

### 2. Open Service Worker DevTools
1. On the extension card, click "Service Worker" link
2. This opens DevTools for the background script
3. Keep Console tab open to monitor for errors

## Test Cases

### A. Basic Functionality Tests

#### A1. Extension Loads Successfully
- [ ] Extension appears in toolbar
- [ ] No errors in `chrome://extensions/`
- [ ] Service worker shows as "Active"
- [ ] Clicking extension icon opens options popup

#### A2. Options Save and Load
- [ ] Change max total tabs → saves correctly
- [ ] Change max window tabs → saves correctly
- [ ] Toggle badge display → saves correctly
- [ ] Toggle pinned tab counting → saves correctly
- [ ] Toggle alert display → saves correctly
- [ ] Custom alert message → saves correctly
- [ ] Close and reopen popup → values persist

### B. Tab Limiting Tests

#### B1. Total Tab Limit
1. Set max total to 5
2. Open tabs until limit reached
3. [ ] New tab is prevented/closed at limit
4. [ ] Alert displays (if enabled)
5. [ ] Badge shows correct count (if enabled)

#### B2. Window Tab Limit
1. Set max window to 3
2. Open tabs in single window until limit
3. [ ] New tab handled according to settings
4. [ ] If "open in new window" enabled, tab moves to new window
5. [ ] If disabled, tab is closed

#### B3. Pinned Tab Handling
1. Pin 2 tabs
2. Set max window to 3, enable "count pinned tabs"
3. [ ] Pinned tabs count toward limit
4. Disable "count pinned tabs"
5. [ ] Pinned tabs excluded from limit

### C. Service Worker Lifecycle Tests

#### C1. Service Worker Idle Recovery
1. Set up limits and badge
2. Wait 60 seconds (service worker goes idle)
3. Check service worker status shows "Inactive"
4. Create new tab
5. [ ] Service worker wakes up
6. [ ] Tab limiting works correctly
7. [ ] Badge updates correctly
8. [ ] No console errors

#### C2. Browser Restart
1. Configure extension settings
2. Close and reopen Chrome completely
3. [ ] Settings persist
4. [ ] Badge displays correctly
5. [ ] Tab limiting works on first new tab

#### C3. Session Restore
1. Enable "Continue where you left off" in Chrome settings
2. Open 10 tabs
3. Close and reopen Chrome
4. [ ] Extension handles restored tabs gracefully
5. [ ] No errors during session restore
6. [ ] Limits enforced after restore completes

### D. Edge Cases

#### D1. Batch Tab Creation (Ctrl+Shift+T)
1. Close 5 tabs
2. Press Ctrl+Shift+T repeatedly to restore
3. [ ] Extension handles rapid tab creation
4. [ ] No duplicate alerts
5. [ ] Correct final state

#### D2. Multiple Windows
1. Open 3 windows
2. Set window limit to 5
3. [ ] Each window tracks independently
4. [ ] Total limit applies across all windows
5. [ ] Badge shows global remaining count

#### D3. Incognito Mode
1. Enable extension in incognito (if desired)
2. [ ] Limits work in incognito windows
3. [ ] Settings shared or separate as expected

#### D4. Very Large Tab Count
1. Set max total to 100
2. Open 95 tabs
3. [ ] Performance remains acceptable
4. [ ] Badge updates without lag

### E. UI Tests

#### E1. Badge Display
- [ ] Badge shows when enabled
- [ ] Badge hidden when disabled
- [ ] Badge color appropriate
- [ ] Badge updates on tab create/close
- [ ] Badge updates on window switch

#### E2. Alert Message
- [ ] Alert displays when limit hit
- [ ] Placeholders replaced correctly:
  - `{place}` → "window" or "total"
  - `{maxPlace}` → current limit value
  - `{maxTotal}` → total limit
  - `{maxWindow}` → window limit

#### E3. Options Page
- [ ] All inputs functional
- [ ] Help section expandable
- [ ] Status message appears on save
- [ ] Status message fades out
- [ ] Disabled states work (alert message disabled when alerts off)

### F. Error Handling Tests

#### F1. Storage Errors
1. Fill storage quota (if possible to test)
2. [ ] Graceful error handling
3. [ ] User informed of issue

#### F2. Invalid Input
1. Try entering invalid values in options
2. [ ] Validation prevents bad values
3. [ ] Min/max constraints enforced

### G. Console Verification

After all tests, verify:
- [ ] No errors in service worker console
- [ ] No errors in popup console
- [ ] No warnings about deprecated APIs
- [ ] No unhandled promise rejections

## Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| Service worker startup | < 100ms | |
| Tab create handling | < 50ms | |
| Badge update | < 20ms | |
| Options save | < 100ms | |

## Regression Checklist

Compare with MV2 version behavior:
- [ ] Tab limiting logic unchanged
- [ ] User settings preserved after upgrade
- [ ] Badge appearance identical
- [ ] Alert message format identical
- [ ] All options function identically

## Final Sign-off

- [ ] All test cases pass
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Ready for Chrome Web Store submission

## Chrome Web Store Submission Notes

If publishing update:
1. Update version in manifest.json
2. Update description if needed
3. Take new screenshots if UI changed
4. Note MV3 migration in changelog
5. Test in Chrome Beta channel before release
