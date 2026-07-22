# Changelog

All notable changes to Relay are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- Wails updated to 2.13, along with the Go dependency set (`golang.org/x/net`, `golang.org/x/crypto`, gRPC, minisign) and the frontend toolchain (Svelte 5.56, TypeScript 7, Vite plugin 6). No behaviour change is intended; the desktop app is otherwise identical to 1.0.0.

### Fixed
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
