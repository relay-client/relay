# Changelog

All notable changes to Relay are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] - 2026-08-01

### Added
- **`pm.request.body` — scripts can read and rewrite the body that is sent.** The pre-request sandbox had no access to the body at all, so the single most common reason to write a pre-request script — generating a payload, or signing one with HMAC — was impossible. `pm.request.body.raw` is readable and writable, `.json()` parses it, `.update(value)` replaces it (objects are stringified), and `.mode` reports the body type. Tengo gets the same surface as `pm.request.body` / `pm.request.set_body()`. A body written onto a request that had none is still sent — Relay picks `json` or `text` from the content — while a binary file body is left alone, since the script never saw those bytes. Test scripts see the body that actually went out.
- **JSON Schema assertions.** `pm.response.to.have.jsonSchema(schema)` validates the response against a draft-07 subset, and reports each failure with its path (`/items/1: missing required property "sku"`). `pm.response.to.have.jsonBody(path, value)` checks a single dotted path. The validator is shared with the `tv4` global and `require("ajv")`, so collections written against either report the same failures.
- **`require()` for the libraries imported Postman scripts expect.** `lodash` (also as the `_` global), `ajv`, `tv4`, `uuid`, `crypto-js`, and `chai` resolve to Relay implementations covering the calls that appear in test scripts; `atob`/`btoa` are globals now too. Anything else — including an unsupported lodash member — fails with a message naming what was asked for, instead of a downstream `undefined is not a function`. The sandbox globals are no longer `var`-declared, so a script can open with `const _ = require("lodash")` or `const expect = require("chai").expect` without a parse error.
- **Bulk edit for key/value tables.** Params, headers, and both form body types switch between the table and a `key:value` text form, `//` disabling a line — Postman's format, so a block of headers pastes straight across. Descriptions, secret flags, and attached files stay with their key across a round trip.
- **Insertable script snippets.** The Scripts tab's reference row is now a snippet library: clicking one appends working code — set a variable, add a header, edit or sign the body, assert a status, check a JSON schema — to the script being edited. The list follows the active engine.

### Fixed
- **A collection's script timeout and `pm.sendRequest` permission were ignored.** Both settings were left out of the list of defaults a request inherits, so a collection that raised the script cap or opened up `pm.sendRequest` changed nothing — while the request's Settings tab displayed *"Applied from collection"* next to the value it was not applying. They inherit now, they can be set from **Collection settings → Settings** (alongside the client certificate, which the documentation promised but the interface never offered), and `relay run` reads both from the workspace instead of only from `--script-timeout` / `--allow-send-request`, so a run behaves in CI the way it does in the app. The inherited set is now checked against the settings model by a test, so the next setting cannot quietly go missing.
- **Scripts could not edit a form or urlencoded body.** Those two modes are sent from their fields, and `pm.request.body.raw` writes went nowhere — no error, no log, just a request that ignored the script. `pm.request.body.urlencoded` and `pm.request.body.formdata` now expose Postman's field list (`add`, `upsert`, `remove`, `each`, `toObject`, …), a file field keeps its attachment when a script rewrites its value, and a raw write on a form body is reported in the script log instead of vanishing. `pm.request.body.update({ mode, urlencoded })` replaces every field at once. A **binary** request with no file chosen also keeps a body the script builds, rather than sending nothing.
- **`pm.request.body.mode` reported Relay's names, not Postman's.** It returned `json`, `text`, or `form`, so an imported `if (pm.request.body.mode === "raw")` never matched and the script took the wrong branch in silence. Every text body is `raw` now, form-data is `formdata`, a file body is `file` — Postman's vocabulary throughout.
- **A JSON Schema failure list stopped at 20 without saying so.** A response far off its schema reported exactly twenty problems as though they were all of them; the report now ends with how many more there were.
- **Importing a Postman collection dropped every script.** The importer never read `item.event`, so pre-request and test scripts — often the reason the collection exists — were silently discarded, and even a Relay → Postman → Relay round trip lost them. Scripts now import, along with request descriptions (which become the request's Docs tab). Folder-level scripts, which have no equivalent layer in Relay, are copied into each request the folder contains and labelled with their origin.
- **Importing a Postman collection dropped everything defined on the collection itself.** Collection variables, collection auth, and the collection's pre-request/test scripts were ignored; only `item` and the top-level `auth` were read. They now land in the collection's defaults, which is where Relay applies them for every request. A request that declared no auth of its own is marked **Inherit Auth** rather than getting a copy, so changing the collection's auth after the import works. Folders that hold no requests are preserved.
- **Postman OAuth 2.0 imports kept only the access token.** The grant type, authorization and token URLs, client id and secret, scope, audience, refresh token, and client authentication method were all discarded, so an imported request started failing with a 401 as soon as the stored token expired. The whole configuration now carries over. AWS SigV4 session tokens import too.
- **Postman environment and globals files could not be imported.** They export as separate JSON files that look nothing like a collection, so the import failed with "Expected a Postman collection JSON file" — leaving every `{{variable}}` in the freshly imported collection unresolved. The Postman importer now recognises them and imports an environment (made active) or merges into Globals, preserving secret flags.
- **Postman exports put `event` in the wrong place.** Scripts were written under `request.event`; the v2.1 schema hangs `event` off the item, which is where Postman looks. Exports also now carry the collection's variables, auth, and scripts, plus each request's documentation.

---

## [1.2.0] - 2026-07-26

### Added
- **Digest auth beyond MD5.** `SHA-256`, `SHA-512-256`, and the `-sess` session variants from RFC 7616, plus `qop=auth-int` and `userhash`. Previously any algorithm other than MD5 was rejected outright, so a modern Digest server failed before the request went out. When a server offers both `auth` and `auth-int`, plain `auth` is used so the body never has to be buffered.
- **Two more OAuth 2.0 grants.** **Device Code** (RFC 8628) shows the user code, opens the verification page, and polls the token endpoint — honouring the server's `interval` and backing off on `slow_down` — for machines where a loopback redirect cannot work. **Password** covers the RFC 6749 resource-owner grant.
- **Client authentication methods for OAuth 2.0.** Alongside HTTP Basic, the token endpoint can now be given `client_secret_post`, **client secret JWT** (HS256), or **private key JWT** (RSA/ECDSA, RFC 7523). The private key accepts a `{{variable}}` so it can live in workspace secrets. An `audience` parameter is also sent when set, which Auth0 and others require.
- **Scripting: `pm.sendRequest`.** Scripts can make their own HTTP calls — fetching a token before the send, or chaining setup — in both Postman's callback form and as a direct return value. It is off by default and enabled per request (**Allow pm.sendRequest** in Settings) or with `relay run --allow-send-request`; the sandbox otherwise stays network-free. The call carries its own 30 s timeout, 8 MB response cap and 5-redirect limit, and deliberately does not inherit the parent request's auth, client certificate, or cookie jar.
- **Scripting: the missing variable scopes.** `pm.collectionVariables` reads and writes the collection scope, and a write is saved back onto the collection after the send. `pm.globals` is available as an alias for the session scope. `pm.variables.get` now resolves across every scope in Postman's precedence order (data row → environment → collection → session) instead of only the session one.
- **Scripting: `pm.crypto` and a `CryptoJS` shim.** MD5/SHA-1/SHA-2 digests, HMAC, base64, random hex, and UUIDs, in hex, base64, or base64url. The `CryptoJS` global covers the digest and encoding calls that appear in real Postman collections, so imported request-signing scripts work unchanged.
- **Scripting: `pm.info`, `pm.cookies`, and `pm.execution.skipRequest()`.** `pm.info` exposes the request name, event name, and iteration counters; `pm.cookies` gives read-only access to the cookies the request would send; `skipRequest()` skips the send from a pre-request script and is reported as a skip rather than a failure, so a conditional request does not fail a run or a CI exit code.
- **Configurable script timeout.** The 2 s cap is now a per-request setting (**Script timeout**) and a `relay run --script-timeout` flag, with a 60 s ceiling so a runaway loop still cannot wedge a send or a CI job. Heavy assertion suites and signing steps no longer fail for want of time.
- **AWS Signature v4: session tokens.** Temporary credentials from STS, an assumed role, or AWS SSO now work: the token goes out as `x-amz-security-token` and is folded into `SignedHeaders`. Sending it without signing it is exactly what AWS rejects, so the signature changes accordingly.
- **A Preview tab in the response viewer.** Images render on a checkerboard with their dimensions, and an image response opens on the tab automatically — the text view only ever showed their bytes as mojibake. HTML renders in a fully sandboxed frame with scripts and network access blocked, so a page from any server is safe to look at. Images reach the viewer through their own lossless channel, because the response body crosses to the interface as text and binary would not survive the trip.
- **Global variables have a home.** They persist across restarts, are shared by every workspace, and are edited under **Environments → Globals**. Previously the scope `pm.globals` and `pm.variables.set` write to existed only in memory, with no way to see it and nothing left after a restart. A value a script writes now shows up in the editor after the send, and is saved.

### Fixed
- **`relay run` could not run a collection that used inherited auth.** A request set to **Inherit Auth** — the pattern the documentation recommends for a collection that talks to one API — aborted with `auth error: unsupported auth type "inherit"`. The CLI read only `defaults.variables` from a collection and ignored its auth, headers, scripts, and settings, so a workspace that worked in the app was unrunnable in CI. The runner now resolves collection defaults with the same rules the app uses.
- **A binary response no longer fills the Body tab with replacement characters.** Relay now detects a non-text body from the actual bytes and shows what it is (sniffed type and size) with a link to the preview and a save action, instead of rendering mojibake. Detection is byte-based, so a server that mislabels binary as `text/html` is handled too — and such a response no longer offers a broken HTML preview.

### Changed
- Collection variables are no longer folded into the session variable pool while a script runs. They live in their own scope, which is what lets `pm.collectionVariables` address them distinctly and removes an ambiguity where a collection variable could not be told apart from a session variable holding the same value.

---

## [1.1.1] - 2026-07-24

### Added
- A **What's new** screen on the first launch after an update, showing that release's notes. It appears once per version — a relaunch, a downgrade, and a first-ever install stay quiet. Reopen it any time from Settings → About → What's new. The notes are bundled with the build, so the screen works offline and always matches the version running.

---

## [1.1.0] - 2026-07-24

### Added
- Client certificates (mutual TLS): a request setting for a certificate, an optional separate key, and a passphrase (which accepts a `{{variable}}` so it can live in workspace secrets). Set it on a collection to reuse across requests. A bad path or wrong passphrase fails before dialing with a clear message.
- `relay run` — a CLI runner for CI and the terminal. It executes a YAML workspace's HTTP and GraphQL requests and their JavaScript test scripts, resolving environment, collection, global, and dynamic variables (the full dynamic set, matching the app), and reports as `cli`, `json`, or `junit`. Exit code is non-zero when any request errors or any assertion fails. Variables a test writes (`pm.environment.set`) carry into later requests in the run. Realtime request types are skipped.
  - **Data-driven runs** (`--data <file.csv|json>`): one iteration per row, columns exposed as variables and via `pm.iterationData.get()`.
  - **Multiple reporters** (`--reporters cli,json,junit`) with file export (`--reporter-json-export`, `--reporter-junit-export`).
  - **Variable scopes**: `--globals`/`--global-var`, and `--export-environment`/`--export-globals` (Postman-compatible) to write final values back after a run.
  - **`--verbose`** per-request request/response detail, **`--insecure`/`-k`**, **`--bail`**, and a failure list plus average-response-time and data-received totals in the summary.
- Scripting: `pm.iterationData.get(key)` reads the current data-file row (read-only) in both the app's Collection Runner and `relay run`.
- Dynamic variables: `{{$guid}}`, `{{$timestamp}}`, `{{$randomEmail}}` and around 50 more, generated at send time under Postman's names. Imported Postman collections that used them no longer fail with "unresolved variable". An environment value with the same name still wins.
- Import for `.http` / `.rest` files from the JetBrains HTTP Client and the VS Code REST Client, including `###` separators, `# @name` directives, and file variables (which become collection variables).
- Response **Timeline** tab: DNS, TCP, TLS and first-byte events on a millisecond scale; connection details (reused or new, addresses, TLS version, cipher, ALPN, SNI); and the request line and headers exactly as they went on the wire, one block per redirect hop. Secret values are masked. Failed requests keep their timeline.
- Response **Diff** tab comparing the current response body with the previous one for the same request, with collapsed unchanged runs.

### Changed
- Wails updated to 2.13, along with the Go dependency set (`golang.org/x/net`, `golang.org/x/crypto`, gRPC, minisign) and the frontend toolchain (Svelte 5.56, TypeScript 7, Vite plugin 6). No behaviour change is intended; the desktop app is otherwise identical to 1.0.0.
- Parallel collection runs take a **Max concurrent requests** setting (default 8, maximum 64).

### Fixed
- Query parameters kept their order on the wire. They were sorted alphabetically whenever automatic URL encoding was on (the default), which broke APIs that sign the query string verbatim. A bare `?flag` also survives instead of becoming `?flag=`.
- HTTP connections are reused between requests. Every send built its own transport, so each one paid a fresh TCP and TLS handshake, reported connect timings that never reflected a warm connection, and left its idle sockets behind until they timed out — a long collection run stranded one transport per request.
- A parallel collection run no longer fires the entire batch at once. A large collection opened one socket per request simultaneously, which could exhaust file descriptors and produce failures unrelated to the API under test.
- Documentation site: the theme toggle changed only its own label because the brand palette was applied to both themes. Light mode works again.
- Documentation site: hand-written links dropped the deploy base path and returned 404s.
- Release automation: release notes fell back to a placeholder instead of reading the annotated tag message.

---

## [1.0.0] - 2026-07-21

First public release. Relay had been developed privately up to this point; the
source is now open under the MIT license and every release is published from
this repository.

### Requests
- All HTTP methods, with query params, headers, and body editors (JSON, form-data, x-www-form-urlencoded, raw text/XML/HTML, binary file).
- GraphQL, Server-Sent Events, WebSocket, Socket.IO, and gRPC request types, each with a dedicated realtime panel.
- SSE streams reconnect like a browser `EventSource`: `Last-Event-ID` resume, server-provided `retry:` interval, and no loss of already-received events.
- cURL import by pasting a command into the URL field.
- Importers for Postman, Insomnia, Bruno/OpenCollection, OpenAPI/Swagger, HAR, cURL, and full-backup archives; exporters for Postman, OpenAPI, OpenCollection, and full backups.

### Authentication
- Bearer, Basic, Digest (full MD5 challenge-response), and API Key (header or query) schemes.
- OAuth 2.0 Client Credentials and Authorization Code with PKCE — loopback browser sign-in per RFC 8252, S256 for public clients, HTTP Basic for confidential ones, stored refresh tokens, and automatic refresh immediately before a request is sent.
- AWS Signature v4, with query-string canonicalization per the signing specification.
- Auth defaults inherited from collection and folder level.

### Scripting
- Sandboxed JavaScript pre-request and test scripts with a `pm.*` API, plus the legacy Tengo engine for existing requests. Imports, filesystem, process, and network access are disabled; execution is capped at 2 seconds.

### Workspaces
- Multiple workspaces, nested collections, drag-and-drop organization, and 14-day request history.
- Git-backed YAML workspaces with diagnostics, conflict helpers, and secrets that never leave the machine.
- Local profile and secrets encrypted at rest with AES-256-GCM; the key lives in the OS credential store when one is available, with a `0600` recovery file as a fallback.

### Response viewer
- Syntax highlighting, line numbers, full-text search with match navigation, headers table, test results, and script logs in a single panel.
- Paginated rendering for large bodies (512 KB pages past a 10 MB threshold) with accurate truncation reporting.
- Save to file and copy to clipboard, including a Send-and-Download path that writes binary responses byte-exact.

### Updates
- Signed auto-updates: `latest.json` is read from release assets rather than the GitHub API, and every downloaded binary must match both the manifest SHA-256 and a minisign signature before it is installed.

### Interface
- Dark and light themes with several built-in variations.
- Configurable keyboard shortcuts throughout, global search (`⌘K`), quick send (`⌘Enter`), and tab switching (`⌘1`–`⌘9`).
- Settings search and full keyboard navigation, theme previews, and onboarding empty states.

[Unreleased]: https://github.com/relay-client/relay/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/relay-client/relay/compare/v1.2.0...v1.3.0
[1.0.0]: https://github.com/relay-client/relay/releases/tag/v1.0.0
