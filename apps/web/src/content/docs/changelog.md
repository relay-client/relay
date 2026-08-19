---
title: Release notes
description: Notable Relay changes and links to the exact notes for each published release.
---

This page summarizes the notable-change log maintained in the source repository. For the exact notes and artifacts attached to every published tag, use the [Relay releases page](https://github.com/relay-client/relay/releases).

## 1.5.0

### Added

- **Response examples.** Keep what an endpoint actually returned, next to the request that asked for it. Capture one from the response panel or from a history entry, edit it by hand, and keep as many as the endpoint has interesting outcomes. Examples live in the workspace files, so a change to one is a reviewable diff in Git rather than something only you can see — and secrets are redacted on capture, in three passes, because a response body is where a token is most likely to slip into a commit.
- **Examples come in with your collections.** Postman saved responses, OpenAPI `responses` (including one derived from the schema when the spec writes no example), OpenCollection, and HAR — a HAR file is a recording of real request/response pairs, and until now Relay imported only the request half. See [Import and export](/docs/guides/import-export/).
- **Compare a response with a saved example.** The Diff tab can use an example as its baseline instead of the previous response, which is how you notice an API that changed shape without anyone saying so. See [Response viewer](/docs/guides/response-viewer/).
- **Multipart parts can carry their own Content-Type**, so an API that validates the MIME type of an upload stops rejecting them.

### Fixed

- **An explicit save could write the previous version of a request.** In manual-save mode, clicking Save assembled the file while the request was still counted as unsaved — so it wrote the version from before your edit, reported success, and cleared the unsaved marker. The change was gone on the next load. Autosave was never affected. If you use manual saving, this is the reason to update.
- **AWS Signature v4 rejected by DynamoDB, Lambda and S3.** Only a fixed set of headers was signed, but AWS requires every `x-amz-*` header to be part of the signature. Signing also no longer reads a large upload into memory before sending it.
- **A JSON body left empty sent no `Content-Type`**, so servers that check the header before reading the body answered 415.
- **Digest auth with no username sent nothing at all** and came back 401 without explanation; it is an error before the request leaves now.
- **`pm.sendRequest` ignored your proxy and client certificate**, so a script could not reach an endpoint the request beside it reached fine.
- **Send-and-Download saved the compressed bytes** when the request asked for an encoding explicitly, producing a gzip file named `report.json`.
- **Importing a Postman collection dropped per-request redirect and TLS settings, and the values behind `:pathVariable`** — leaving a URL that still said `:id` and could not be sent.
- **The header buttons moved when you opened the runner**, leaving a gap at the right edge.

## 1.4.0

### Added

- **Request history keeps the response.** Opening an entry restores what came back alongside the request — no re-sending to find out, which would answer a different question anyway. A row's ••• menu has **View response** for looking without reopening. Bodies are stored in their own encrypted files, capped at 2 MB, and deleted with their entry. See [Request history](/docs/guides/history/).
- **Variables can be built from other variables.** `baseUrl = {{scheme}}://{{host}}` resolves now, so retargeting a whole collection at staging is one edit. See [Environments and variables](/docs/guides/environments/).
- **`relay run` obtains its own OAuth 2.0 tokens.** Client credentials and password grants are fetched from the token endpoint; the interactive grants fall back to a stored refresh token. An OAuth-protected collection can finally run in CI. See [CLI runner](/docs/guides/cli-runner/).
- **Authorization for WebSocket and Socket.IO.** The handshake always carried auth; the tab to configure it was missing.
- **SSE reconnection and WebSocket keep-alive are configurable**, and the **`Host` header** can be set. See [Request settings](/docs/guides/request-settings/).

### Fixed

- **Saving a workspace dropped auth fields.** A request set to **Inherit Auth** lost the setting and reverted to sending none, and every OAuth 2.0 field added in 1.2.0 — AWS session tokens, Device Code, Password, client-authentication methods, private-key JWT — was discarded on each save. The workspace file is the only copy, so what the writer dropped was gone.
- **Any pre-request script corrupted repeated headers and query parameters.** `?id=1&id=2` went out as `?id=2&id=2`, and a disabled row came back enabled — for any request running any script, including one that only logged.
- **OAuth 2.0 tokens were never refreshed for a request that was not on screen**, so a collection run started returning 401 the moment the token expired, and **Inherit Auth** never refreshed at all.
- **Importing an OpenAPI spec produced requests that could not be sent** — path parameters resolved to nothing, the server was pasted into every URL, and security schemes were dropped. See [Import and export](/docs/guides/import-export/).
- **Generated code dropped Basic, Digest, OAuth 2.0 and AWS auth**, so a copied request came back 401 without saying anything had been left out. See [Code generation](/docs/guides/code-generation/).
- **The client-certificate passphrase was committed in plain text** when typed literally rather than as a variable.
- Collection variables written by a script were lost when it then skipped the request; a parallel run ignored variables written by earlier iterations; SSE offered a Scripts tab that never ran anything; the realtime panel's tabs wrapped on a narrow window.

### Changed

- The frontend no longer restates the Go structs — wire types are derived from the generated bindings, and CI fails when they go stale. Four of the defects above were the same failure, a hand-maintained copy falling behind, and this closes that class.

## 1.3.0

### Added

- **`pm.request.body` in scripts** — read, rewrite, and sign the body that actually goes out. `.raw` is readable and writable, `.json()` parses it, `.update()` replaces it, and form or urlencoded bodies are edited field by field through `.urlencoded` / `.formdata`. See [Scripting API](/docs/reference/scripting-api/#pmrequest).
- **JSON Schema assertions** — `pm.response.to.have.jsonSchema(schema)` validates a response against a draft-07 subset and reports each failure with its path; `pm.response.to.have.jsonBody(path, value)` checks a single dotted path.
- **`require()` for the libraries Postman scripts expect** — `lodash` (also as `_`), `ajv`, `tv4`, `uuid`, `crypto-js`, and `chai` resolve to Relay implementations, so imported test scripts run unchanged. Anything outside that surface fails with a message naming what was asked for.
- **Bulk edit for key/value tables** — params, headers, and both form body types switch between the table and a `key:value` text form, `//` disabling a line. It is Postman's format, so a block of headers pastes straight across.
- **Insertable script snippets** — the Scripts tab's reference row is now a snippet library: set a variable, add a header, sign the body, assert a status or a schema.

### Fixed

- **Importing a Postman collection dropped scripts, docs, and everything on the collection itself.** Pre-request and test scripts, request descriptions, collection variables, collection auth, and collection scripts were all discarded; OAuth 2.0 imports kept only the access token, so a request started failing with a 401 as soon as it expired. All of it carries over now, and Postman environment and globals files can be imported too. See [Import and export](/docs/guides/import-export/).
- **A collection's script timeout and `pm.sendRequest` permission were ignored** — both were missing from the settings a request inherits, while the Settings tab claimed they applied. They inherit now, they can be set from **Collection settings → Settings** (alongside the client certificate), and `relay run` reads them from the workspace instead of only from its flags.
- **Scripts could not edit a form or urlencoded body**, and `pm.request.body.mode` reported Relay's own names instead of Postman's, so an imported `if (mode === "raw")` silently took the wrong branch.
- **A JSON Schema failure list stopped at 20 without saying so.**

## 1.2.0

### Added

- **OAuth 2.0: Device Code and Password grants** — Device Code (RFC 8628) shows the user code, opens the verification page and polls for approval, which is how you sign in on a machine where a browser redirect cannot come back. See [Authentication](/docs/guides/authentication/#oauth-20).
- **OAuth 2.0: client authentication methods** — alongside HTTP Basic, the token endpoint can be given credentials in the body, a client secret JWT, or a private key JWT (RSA/ECDSA, RFC 7523). The private key accepts a `{{variable}}`, so it can live in workspace secrets. An `audience` parameter is sent when set.
- **Digest auth beyond MD5** — `SHA-256`, `SHA-512-256` and the `-sess` variants from RFC 7616, plus `qop=auth-int` and `userhash`. A modern Digest server previously failed before the request went out.
- **AWS Signature v4: session tokens** — temporary credentials from STS, an assumed role or AWS SSO now work.
- **`pm.sendRequest`** — scripts can make their own HTTP calls, for fetching a token before the send or chaining setup. Off by default; enable **Allow pm.sendRequest** on a request or pass `--allow-send-request` to the CLI runner. See [Scripting API](/docs/reference/scripting-api/#pmsendrequest).
- **Request signing in scripts** — `pm.crypto` for hashes, HMAC and encodings, plus a `CryptoJS` shim so signing scripts imported from Postman work unchanged.
- **The missing `pm.*` scopes** — `pm.collectionVariables` (written back to the collection), `pm.globals`, `pm.info`, `pm.cookies`, and `pm.execution.skipRequest()` for a request that should be skipped rather than failed.
- **Global variables** — persisted across restarts, shared by every workspace, and edited under **Environments → Globals**. See [Environments](/docs/guides/environments/#global-variables).
- **Response Preview** — images and HTML render properly instead of appearing as unreadable text. See [Response viewer](/docs/guides/response-viewer/#preview).
- **Configurable script timeout** — raise the 2000 ms cap per request or with `relay run --script-timeout` when an assertion suite or a signing step needs longer.

### Fixed

- **`relay run` could not run a collection that used inherited auth.** A request set to **Inherit Auth** aborted the run with `unsupported auth type "inherit"`, because the runner ignored everything but a collection's variables. Collection auth, headers, scripts and settings now apply exactly as they do in the app. See [CLI runner](/docs/guides/cli-runner/).
- **A binary response no longer fills the Body tab with replacement characters.** Relay identifies a non-text body from its actual bytes, so a payload mislabelled as `text/html` is caught too, and shows what it is with links to preview or save it.

## 1.1.1

### Added

- **What's new on first launch** — after updating, Relay opens a screen with that release's notes. It appears once per version: relaunching the same build, downgrading, and a first-ever install stay quiet. Reopen it any time from **Settings → About → What's new**. The notes ship with the build, so the screen works offline and always matches the version you are running. See [App settings](/docs/guides/settings/#whats-new).

## 1.1.0

### Added

- **CLI runner** — `relay run` executes a YAML workspace's HTTP and GraphQL requests and their JavaScript test scripts from the terminal or CI. Data-driven iterations from a CSV/JSON file (`--data`), `cli`/`json`/`junit` reporters with file export, global and environment variable scopes with export-back, `--verbose`, `--bail`, `--insecure`, and a non-zero exit code when a request errors or an assertion fails. See [CLI runner](/docs/guides/cli-runner/).
- **Client certificates (mutual TLS)** — present a certificate, optional separate key, and passphrase per request or inherited from a collection. See [Per-request settings](/docs/guides/request-settings/#client-certificate-mutual-tls).
- **Dynamic variables** — `{{$guid}}`, `{{$timestamp}}`, `{{$randomEmail}}` and around 50 more under Postman's names, generated at send time. Imported Postman collections that used them no longer fail with an unresolved variable.
- **`.http` / `.rest` import** — files from the JetBrains HTTP Client and the VS Code REST Client, including `###` separators, `# @name` directives, and file variables.
- **Response Timeline tab** — DNS, TCP, TLS and first-byte events on a millisecond scale, connection details (reused or new, addresses, TLS version, cipher, ALPN, SNI), and the request exactly as it went on the wire, one block per redirect hop.
- **Response Diff tab** — compares the current response body against the previous one for the same request, collapsing unchanged runs.
- **Scripting**: `pm.iterationData.get(key)` reads the current data-file row during a data-driven run.

### Changed

- Parallel collection runs take a **Max concurrent requests** setting (default 8, maximum 64).
- Wails updated to 2.13 along with the Go and frontend dependency sets.

### Fixed

- Query parameters keep their order on the wire. They were sorted alphabetically whenever automatic URL encoding was on (the default), breaking APIs that sign the query string verbatim.
- HTTP connections are reused between requests instead of building a fresh transport — and leaking its idle sockets — on every send.
- A parallel collection run no longer fires the entire batch at once, which could exhaust file descriptors on a large collection.

## 1.0.0

First public release. Relay was developed privately until this point; the source is now open under the MIT license and every release is published from the main repository.

### Requests

- All HTTP methods with query parameter, header, and body editors (JSON, form-data, URL-encoded, raw, and binary).
- GraphQL, Server-Sent Events, WebSocket, Socket.IO, and gRPC request types with dedicated realtime panels.
- SSE streams reconnect like a browser `EventSource`, resuming with `Last-Event-ID` and honoring the server's `retry:` interval.
- cURL import by pasting a command into the URL field.
- Importers for Postman, Insomnia, Bruno/OpenCollection, OpenAPI/Swagger, HAR, cURL, and full backups; exporters for Postman, OpenAPI, OpenCollection, and full backups.

### Authentication

- Bearer, Basic, Digest, and API Key schemes.
- OAuth 2.0 Client Credentials and Authorization Code with PKCE — loopback browser sign-in, stored refresh tokens, and automatic refresh before send.
- AWS Signature v4 with specification-compliant query canonicalization.
- Auth defaults inherited from collection and folder level.

### Scripting

- Sandboxed JavaScript pre-request and test scripts with a `pm.*` API, plus the legacy Tengo engine. Imports, filesystem, process, and network access are disabled; execution is capped at 2 seconds.

### Workspaces

- Multiple workspaces, nested collections, drag-and-drop organization, and 14-day request history.
- Git-backed YAML workspaces with diagnostics, conflict helpers, and machine-local secrets.
- Local profile and secrets encrypted at rest with AES-256-GCM, keyed through the OS credential store.

### Response viewer

- Syntax highlighting, full-text search with match navigation, headers, test results, and script logs in one panel.
- Paginated rendering for large bodies with accurate truncation reporting.
- Save to file and copy to clipboard, including byte-exact binary downloads.

### Updates

- Signed auto-updates: `latest.json` is read from release assets, and every downloaded binary must match both the manifest SHA-256 and a minisign signature before installation.

### Interface

- Dark and light themes with several built-in variations.
- Configurable keyboard shortcuts, global search, quick send, and tab switching.
- Settings search and full keyboard navigation, theme previews, and onboarding empty states.
