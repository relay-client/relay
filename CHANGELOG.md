# Changelog

All notable changes to Relay are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/relay-client/relay/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/relay-client/relay/releases/tag/v1.0.0
