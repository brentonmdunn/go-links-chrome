# Security review

Reviewed on 2026-11-17. This is a source review with automated regression tests, not an independent penetration test or security certification.

## Scope and result

Reviewed the manifest, service worker, URL parser and resolver, manager DOM rendering, imports and exports, local storage, and web-accessible redirect page. Threats considered include hostile shortcut input, untrusted imported JSON, navigation initiated by a website, and unauthorized extension messages.

No confirmed critical or high-severity vulnerability was identified in the reviewed source. The changes below address a low-severity resource-exhaustion risk and strengthen existing boundaries. Browser-level enforcement of the redirect rules, resource accessibility, CSP, and referrer policy has not been verified in a loaded Chrome instance. The automated background tests use mocked Chrome APIs.

## Findings and changes

| Finding | Assessment | Change |
| --- | --- | --- |
| Imports had a file-size check in the UI but no limit on the number of shortcuts or individual field lengths. A user-imported file could create an excessive number of DOM nodes and impair the manager. | Low severity; requires importing hostile or unusually large configuration. | Enforced 5,000 shortcuts, 5 MB serialized configuration, 256-character names, 8,192-character destinations, and 16,384-character navigation input. The worker checks the merged configuration before writing, so successive imports cannot bypass the total limit. |
| Write-message authorization used a URL prefix comparison. | Hardening; no external exploit demonstrated. No similarly prefixed resource exists in the current package, and the manager was already private. | Require the same extension ID and host, the exact `/manager.html` path, and no child-frame sender. Reject unknown operations, malformed payloads, and non-boolean overwrite flags. |
| Only Chrome's default extension CSP was in place. | Defense in depth; no DOM code-injection sink found. | Added an explicit policy allowing packaged scripts and styles while blocking other resource loads by default, object embedding, framing, base-URL changes, and native form submissions. Added `no-referrer` metadata to both pages. |
| Destinations were checked before template expansion, but not after expansion. Backslash-containing URLs could also be stored with a different apparent structure than the browser's parsed structure. | Defense in depth; hostile remainder tests did not demonstrate an origin escape in the previous implementation. | Reject ambiguous backslashes and control characters in configured destinations. Validate expanded destinations against the original scheme/host/port origin and reject credentials or control characters. |
| Local storage used Chrome's default content-script access level. | Defense in depth; this extension contains no content scripts. | Restrict storage to trusted extension contexts using `setAccessLevel`. This does not remove access from the extension's own redirect page. |

The earlier checkbox layout fix is retained. These changes do not delete saved shortcuts or add new permissions. Existing configurations that exceed the new limits or contain newly rejected URL forms will require correction before the manager can load them.

## Existing controls checked

- Host access is restricted to `http://go/*` and `https://go/*`; the redirect rule applies only to top-level navigation and the exact `go` hostname. There is no general browsing-history, cookie, scripting, or broad host permission.
- Only `redirect.html` is web-accessible, with `go` origins allowed. The manager is private. The resolver accepts only HTTP(S) go-host input and cannot modify saved shortcuts.
- HTTP(S) destinations are required; script/data/file schemes, embedded credentials, and direct `go` loop destinations are rejected. Templates cannot select a different destination origin during expansion.
- Imported labels and URLs are rendered as text, not HTML. Omnibox suggestion strings escape XML markup. Prototype-inherited properties are not resolved as shortcuts.
- One worker serializes writes. Imports are validated before changes are committed, including the final merged configuration; rejected imports leave existing data intact.
- There are no third-party runtime packages, remote scripts, analytics, remote configuration, or network-fetch code. Normal navigation to a destination still makes the browser's ordinary network request.

## Remaining risks and intended behavior

- **Local data and exports:** the application does not encrypt its configuration. Someone with access to this Chrome profile, its developer tools, the local extension source, or an exported JSON file can read or alter relevant data. Do not store passwords, API keys, session tokens, or sensitive signed URLs in shortcuts. Device and profile security remain the user's responsibility.
- **Imported destinations:** importing a file intentionally trusts its URL mappings. An untrusted file can direct shortcuts to phishing or other unwanted HTTP(S) sites. HTTP destinations remain supported for compatibility with internal systems and provide no transport encryption; HTTPS should be used where available.
- **Navigation is not authorization:** websites can link to `http://go/<shortcut>`, and paths, queries, and templates can carry attacker-chosen values to a configured destination. The extension does not fetch destination contents or grant access to them. Destination applications must enforce authentication, authorization, CSRF protection, and safe handling of their own query parameters. Templates preserve path substitution semantics; they do not URL-encode a remainder as a single query value.
- **Address-bar and history exposure:** shortcut input and destination URLs can appear in browser history or address-bar suggestions. Bare `go/name` can be treated as a search and sent to the configured search provider; `go` + Tab activates the extension explicitly.
- **Unpacked source:** local source modifications execute after extension reload. This project has no signing, managed rollout, organization-wide access control, or automatic update channel.

## Verification

`npm test` passes 18 tests covering resolution, hostile URL forms and remainders, malformed and unauthorized messages, configuration limits, import atomicity, concurrent writes, and manifest restrictions. JavaScript syntax and Git whitespace checks also pass. The manifest tests inspect policy declarations; they do not prove Chrome enforces them at runtime.

To complete browser verification after reloading the extension, check the extension's Errors panel, create/edit/delete a shortcut, exercise keyword and explicit URL navigation, and perform an import/export round trip. Confirm rejected imports preserve saved links and inspect DevTools for unexpected resource loads or CSP errors.

## References

- [Chrome extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- [Extension content security policy and default restrictions](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Storage access levels and local storage behavior](https://developer.chrome.com/docs/extensions/reference/api/storage)
