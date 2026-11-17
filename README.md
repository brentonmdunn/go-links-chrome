# Go Links for Chrome

A local Manifest V3 extension that recreates [brentonmdunn/go-links](https://github.com/brentonmdunn/go-links) inside Chrome. No server, administrator access, build step, or Chrome Web Store listing required.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and select this folder (`go-links-chrome`, containing `manifest.json`).
4. Pin **Go Links** from Chrome’s puzzle-piece menu. Click its icon to manage your links.

Keep the folder where it is while installed. After changing extension source files, click **Reload** on its card at `chrome://extensions`, then reload any open manager tabs. Editing shortcuts in the manager takes effect immediately.

Chrome documents this installation flow at https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked.

## Use

- **Reliable address-bar entry:** type `go`, press **Tab** (or **Space**), type `calendar`, then Enter. Suggestions appear as you type. An empty input opens the manager.
- **URL entry:** navigate to `http://go/calendar` or `https://go/calendar`. `http://go/` opens the manager.
- Bare `go/calendar` also works when Chrome recognizes it as a URL. Chrome can interpret single-word hosts as search terms; use the explicit URL or the `go` keyword when this happens. The extension does not intercept search-engine traffic or change your search provider.
- Unknown shortcuts open the manager with the shortcut prefilled.

New installations start with no links. Add your own shortcuts in the manager or import an existing JSON file.

## Resolution

Shortcuts are case-insensitive. Lookup uses the longest matching prefix: `gh/work/repo` tries `gh/work/repo`, `gh/work`, then `gh`. The remainder keeps its original case.

| Destination | Input | Result |
| --- | --- | --- |
| `https://github.com/you/{*}` | `gh/repo/pull/42` | `https://github.com/you/repo/pull/42` |
| `https://catalog.ucsd.edu/courses/{*upper}.html` | `catalog/cse` | `https://catalog.ucsd.edu/courses/CSE.html` |
| `https://example.com/{*lower}` | `lower/ABC` | `https://example.com/abc` |
| `https://drive.google.com` | `drive/folder/abc` | `https://drive.google.com/folder/abc` |

With no remainder, templates open the destination’s site root. Incoming queries merge with existing destination queries. The keyword route preserves incoming fragments; URL redirects depend on the fragment supplied by Chrome’s request handling. Additional paths on destinations with queries are appended to the pathname, before the query and fragment.

## Existing links

Click **Import JSON** and choose your original `~/.config/golinks/links.json`. The JSON format is unchanged: a flat object mapping names to URL strings. Imports are validated in full before anything is saved. Existing links win unless **Replace matching shortcuts** is checked.

**Export JSON** downloads a compatible `links.json` backup. Unlike the original daemon, this extension stores changes in Chrome’s local extension storage and does not watch or update the original file. Data stays in this Chrome profile, survives extension reloads and browser restarts, and is removed if the extension is uninstalled. Export before removing it or moving to another profile.

## Permissions and implementation

- `storage`: save links locally; no cloud sync or analytics.
- `declarativeNetRequestWithHostAccess` and host access only for `http://go/*` and `https://go/*`: intercept top-level go-host navigation before a network request and redirect to an extension resolver page. The rule persists when the service worker sleeps.
- `omnibox`: the `go` address-bar keyword. No access to general browsing history or other hosts is requested.

Only HTTP(S) destinations are accepted, and destinations pointing back to `go` are rejected to avoid redirect loops. The manager and export functionality use bundled scripts with no remotely hosted code or dependencies.

This affects Chrome profiles where you load the extension. Your original Go daemon is independent; other browsers still need that installation if you want shortcuts there. A managed browser may restrict unpacked extensions.

## Development

Requires Node.js 20+ only for tests; the extension itself needs no Node installation.

```sh
npm test
```

After loading, check the extension’s **Errors** section at `chrome://extensions` if something fails. Smoke test `http://go/`, `http://go/calendar`, `go` + Tab → `gh/owner/repo`, a missing shortcut, editing and deleting, and a JSON import/export round trip.
