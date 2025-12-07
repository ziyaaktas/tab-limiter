# Step 1: Migrate manifest.json to Manifest V3

## Objective
Update the extension manifest from version 2 to version 3 to comply with Chrome's current requirements.

## Current State (Manifest V2)

```json
{
  "name": "Tab Limiter",
  "description": "Limit the number of open tabs – in total and per window",
  "version": "0.3.0",
  "author": "Matthias Vogt",
  "manifest_version": 2,
  "permissions": ["storage"],
  "browser_action": {
    "default_popup": "options.html",
    "default_title": "Tab Limiter",
    "icons": { "48": "icons/48.png", "128": "icons/128.png" }
  },
  "options_page": "options.html",
  "background": { "scripts": ["background.js"] }
}
```

## Required Changes

### 1. Update manifest_version
```diff
- "manifest_version": 2,
+ "manifest_version": 3,
```

### 2. Replace browser_action with action
```diff
- "browser_action": {
+ "action": {
    "default_popup": "options.html",
    "default_title": "Tab Limiter",
-   "icons": { "48": "icons/48.png", "128": "icons/128.png" }
+   "default_icon": {
+     "48": "icons/48.png",
+     "128": "icons/128.png"
+   }
  },
```

### 3. Convert background scripts to service worker
```diff
- "background": { "scripts": ["background.js"] }
+ "background": {
+   "service_worker": "background.js"
+ }
```

### 4. Add explicit tabs permission
In MV3, the `tabs` permission must be explicitly declared to access tab URLs and use certain tabs API features.

```diff
- "permissions": ["storage"],
+ "permissions": ["storage", "tabs"],
```

## Target State (Manifest V3)

```json
{
  "name": "Tab Limiter",
  "description": "Limit the number of open tabs – in total and per window",
  "version": "0.4.0",
  "author": "Ziya Aktas",
  "manifest_version": 3,
  "permissions": ["storage", "tabs"],
  "action": {
    "default_popup": "options.html",
    "default_title": "Tab Limiter",
    "default_icon": {
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "options_page": "options.html",
  "background": {
    "service_worker": "background.js"
  }
}
```

## Validation Checklist

- [ ] `manifest_version` is set to `3`
- [ ] `browser_action` renamed to `action`
- [ ] `icons` renamed to `default_icon` inside action
- [ ] Background script converted to `service_worker` format
- [ ] `tabs` permission added
- [ ] Version number bumped to indicate breaking change
- [ ] Extension loads without manifest errors in `chrome://extensions`
