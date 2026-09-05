# Changelog

All notable changes to Relay are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed
- **An upload went out with no `Content-Length`.** `net/http` works the body length out for itself only for the in-memory reader types, so a binary file body and a multipart body — both streams — were framed `Transfer-Encoding: chunked`. That is exactly what the services people upload to refuse: an S3 presigned `PUT` requires a declared length, so does Azure Blob, and a fair number of nginx and API-gateway setups answer `411 Length Required` and nothing else. Both now declare their exact size. The multipart length is computed from the rows without writing anything, and a test measures a real body against that arithmetic so the assumption it makes about `mime/multipart`'s framing cannot drift silently; a file that cannot be measured leaves the length unknown and streams chunked as before. The same gap left `GetBody` empty, so a `307`/`308` redirect had nothing to replay and abandoned the send — a file body now survives one.
- **The Auth tab silently replaced a header written by hand.** Auth is applied after the header rows, so configuring bearer auth *and* typing an `Authorization` header sent the tab's value and discarded the row — with the row still on screen, looking sent. The precedence is unchanged (it is the safe one to keep), but the response panel now names what was replaced, next to the notice that already explains dropped framing headers. Covers `Authorization` for bearer, Basic and OAuth 2.0, and whatever header name an API key is configured under.
- **AWS Signature v4 signed the path with one URI encoding.** S3 wants exactly that, but every other service asks for the path to be normalised per RFC 3986 and then encoded *twice*. Any path carrying a character that needs escaping was therefore rejected with `SignatureDoesNotMatch` — including the ordinary shape of a Lambda invoke URL, which carries the function ARN, colons and all, in the path. S3 keeps its own rule.
- **A form part's `Content-Type` was lost when a cURL command was pasted.** The parser has read curl's `;type=` suffix since 1.5.0 and the export writes it, but the paste path dropped it while building the rows — the one place that round trip was broken, and the difference between an upload an API accepts and one it rejects on the MIME type.
- **Copying a request as cURL or as a code snippet mislabelled the body.** Only JSON and GraphQL bodies got a `Content-Type`, so an XML, HTML or plain-text body arrived as curl's own default, `application/x-www-form-urlencoded` — a different request from the one that was copied. Every string-payload body type now declares what the sender declares, taken from one table shared by both generators. The body also goes out as `--data-raw`, since `-d` reads a leading `@` as a filename.
- **`-k`, `--max-time` and `--proxy` were discarded when a cURL command was pasted.** Each maps onto a request setting Relay already has, so the pasted command produced a request that quietly behaved differently — most of all `-k`, whose entire purpose is that the endpoint's certificate does not verify.
- **A second value for a query parameter already in the URL was dropped.** Folding the URL's query into the params table deduplicated by key alone, so `?tag=a` in the URL with `tag=b` in the table sent only `tag=a`. Only the row the two-way sync mirrored — same key *and* same value — is folded away now. Repeated keys are the case the sender goes out of its way to preserve, since the APIs that sign a query string verbatim depend on it.
- **Capturing a response example rewrote the body.** It was parsed and re-serialised even when the redaction sweep found nothing, which is lossy in ways that matter for a file whose whole job is to record what an endpoint really returned: an id past `Number.MAX_SAFE_INTEGER` came back a different number, and a duplicate key collapsed. The bytes are now left alone unless something was actually redacted.
- **A `CR` or `LF` in a multipart field name could inject headers into the part.** Relay escapes those, but only on the branch taken when the row names its own `Content-Type`; without one it fell through to `mime/multipart`'s helpers, which escape quotes and leave line breaks intact. Every part is now written through the same escaping.
- **An empty `form-data` or `x-www-form-urlencoded` body was framed on a `GET`.** The raw body types already treated an empty payload on a method that conventionally carries none as no body at all; these two did not.

### Changed
- The README no longer understates what is there: OAuth 2.0 lists the Password and Device Code grants added in 1.4.0, the per-request settings mention the proxy, and the scripting section gives the configurable timeout rather than only the 2-second default — and stops listing `require` as disabled two paragraphs after describing what it resolves.

---

## [1.5.0] - 2026-08-19

### Added
- **Response examples.** A saved response, paired with the request snapshot that produced it, kept with the request in the workspace. They document what an endpoint really returns, they are the fixture a test can be written against, and — because they live in the Git-backed YAML — changing one shows up as a reviewable diff, which is something a cloud-hosted example cannot offer. Capture one from the response panel or from a history entry, edit its status and body by hand, and reorder or rename the list from the request's new **Examples** tab. Each example is one file under `collections/<collection>/examples/<request>/`, with the response body in a sibling file named for its media type: a JSON body embedded in YAML is a block scalar no reviewer can read, and as its own `.json` file it diffs line by line. Capturing redacts in three layers — the exact values of secret environment variables, then the same key sweep the export paths use, then a warning for anything credential-shaped that survived — because a response body is the most likely place for a token to end up in a commit.
- **Examples arrive from every import path that carries them**, all of which discarded the data before: Postman's `item.response[]` (both directions), OpenAPI `responses` including a value derived from the response schema when the spec writes none, OpenCollection, and — the richest source, and the one nobody had noticed — **HAR**, which *is* a recording of request/response pairs and was being imported with the response half thrown away.
- **The Diff tab can compare against a saved example**, not just against the previous response. This is what keeps an example from quietly going stale: a response that no longer matches the contract shows up as a diff instead of passing unnoticed. The baseline is chosen per request, and falls back to the previous response if the example it pointed at is deleted.
- **A multipart part can carry its own Content-Type.** Every part went out as `application/octet-stream`, so an API that checks the MIME type of an upload rejected everything Relay sent. The value round-trips through Postman, Insomnia, OpenCollection and cURL's `;type=` suffix.
- **`relay --version` and `relay --diagnostics`.** Both are answered before the window opens, so they still work on a machine where it cannot — and the release now runs the binary it just built and checks the version it reports against the tag. A build whose `-ldflags` stamp did not land still calls itself `dev`, which would leave the updater unable to recognise any newer release.
- **Relay keeps a log, and the Support screen can hand it over.** The things worth knowing after something goes wrong — a credential store that could not be reached, a key that fell back to the recovery file — were written to a stdout that a packaged app throws away. They now go to `relay.log` in Relay's app-data directory, capped and rotated with one previous generation. **Settings → Support** gained **Copy diagnostics** (version, platform, Go, Git, storage mode and credential store — no workspace paths, so it can be pasted into a public issue) and **Open log folder**.

### Fixed
- **An explicit save wrote the previously saved version of the request.** In manual-save mode the store deliberately keeps the last saved version of a request that has unsaved edits — that is what stops a half-typed change reaching disk. But the dirty mark was cleared only after the write finished, so a save the user asked for was still counted as dirty while the file was being assembled: it wrote the *previous* version of the whole request, reported success, and cleared the unsaved indicator. The edit was gone on the next load with nothing saying so. Autosave was never affected.
- **AWS Signature v4 signed a fixed list of headers.** AWS requires every `x-amz-*` header to be part of the signature, so DynamoDB (`X-Amz-Target`), Lambda (`X-Amz-Invocation-Type`) and S3 with any of its option headers rejected every request with `SignatureDoesNotMatch`. The signed set is now taken from the request, canonical values are joined and whitespace-collapsed as the specification asks, and the signature covers the `Host` that is actually sent — overriding the header used to sign a name the server never sees. Signing also stopped reading the whole body into memory: past 32 MB, above every service that requires a signed payload, a large upload streams as `UNSIGNED-PAYLOAD` instead of being buffered whole.
- **A raw body type dropped its `Content-Type` when the text was empty.** Choosing JSON and sending nothing is a deliberate choice — the default body type is "none" — and the servers that validate the header before reading the body answered 415. `GET` and `HEAD` are left alone.
- **Digest auth with no username did nothing at all.** The challenge-response transport is only attached when there is a username, so the request went out unauthenticated and came back 401 with nothing to explain it. It is now an error before the request leaves, like AWS auth with no region.
- **`pm.sendRequest` ignored the request's proxy and client certificate.** It built its own blank transport, so a script logging in from behind a corporate proxy — or against an mTLS endpoint — could not reach it while the request beside it worked. It also returned a partially read body as if it were the whole response.
- **Send-and-Download saved the compressed stream.** Go only undoes gzip, and only when it set `Accept-Encoding` itself, so a request that asked for an encoding explicitly wrote a gzip file under a name like `report.json`. The body is decompressed on the way to the file now, falling back to the raw bytes when the stream is not what it claimed to be.
- **Importing a Postman collection dropped `protocolProfileBehavior` and path-variable values.** A collection that turns off redirects or certificate checking imported as one that does neither, and a URL kept `:id` with the value that fills it discarded — leaving a request that could not be sent. Relay has no per-request path variables, so those values are substituted into the URL.
- **The header actions moved when the view changed.** Save and Revert exist only for a request, so opening the runner unmounted them and the buttons that stay — runner, cookies, settings — slid sideways while a gap opened at the right edge. The searchbar's last grid track now takes the slack instead of being sized to its contents.
- OAuth 2.0 built a fresh HTTP transport for every token request and stranded its idle sockets, which a collection run against an OAuth-protected API did once per send.
- **A Git-backed workspace looked like an ordinary folder on a machine without Git.** Relay drives Git by running it, and the failure to find the binary was discarded — so `git rev-parse` failing because there is no Git was reported the same way as "this is not a repository". On a stock Windows machine, or a Mac whose Command Line Tools are missing, opening a repository you had cloned elsewhere offered to initialise a new one over the top of it, and every button that followed failed with a raw `exec` error. Relay now says which of the two it is, names the fix for that platform, and disables the Git-dependent actions instead of inviting a click that cannot work. A workspace still opens in local mode without Git.
- **An unsaved edit could follow you onto another branch.** A branch checkout refuses to run against local changes, but it read `gitStatus`, which describes the files on disk — an edit made within the autosave debounce is not there yet. So the check passed, Git swapped the files underneath, and the debounce then wrote the pre-checkout editor state into the branch that had just been checked out: an uncommitted change on a branch it was never made on. The same window sat in front of creating a branch, applying a stash, pushing, and resolving, continuing or aborting a merge. Every operation that touches the worktree now settles the editor first — saving the pending write, or dropping it where the operation is what restores the files — through one helper, so this cannot be forgotten one operation at a time.
- **The repository root was reported in Git's shape, not the platform's.** `git rev-parse --show-toplevel` answers with forward slashes everywhere, including Windows, where that path is not comparable to one built with `filepath`.

### Changed
- **CI runs the Go tests on macOS and Windows, not only Linux.** Relay ships all three, and the Go side is where the platforms differ — it shells out to Git, resolves paths, and talks to each OS credential store. None of that was exercised until a user hit it. Three tests that assert Relay refuses to follow a symbolic link now skip on a machine that cannot create one, rather than failing for a reason that is not about Relay.
- **`latest.json` is tested against the code that reads it.** The manifest is written by a Python script during the release and parsed by the Go updater on every installed copy, with nothing connecting the two: a drift in field names or platform keys would stop auto-update everywhere at once, silently, and the release that would fix it is the one those copies could no longer see. The test runs the real script over a fake release and decodes the result with the real parser — including looking up the running platform's own key, which the cross-platform matrix now exercises on each OS.
- **The fatal-error guard is covered by tests.** It is the one part of Relay that has to behave correctly at the moment everything else already has not, which is exactly when a bug in it would go unnoticed. The classification — ignored noise, an immediately fatal render loop, and the burst threshold — is now a pure function with tests around it.
- **E2E covers the Git panel and collection import**, next to the existing walkthrough; committing from the Git panel is checked to write the editor's pending edit first, which is the regression above.
- **Durable writes survive a locked destination on Windows.** Every saved file lands through a temporary copy renamed over the target, which is what makes the write atomic. Unix always allows that rename; Windows refuses it while any other handle holds the destination — an antivirus scanner, a backup agent, the search indexer — and reports "Access is denied", so a save that hit that instant simply failed. The rename now retries over a short window, which is exactly the case the cross-platform matrix surfaced on its first run.
- **Relay's `.gitignore` entries follow the file's own line ending.** Git checks a workspace out with CRLF on Windows by default, and the managed entries were appended with LF — leaving a file with two kinds of line ending, which reads as a whole-file change the next time anything normalises it.
- **gRPC import paths are compared in the platform's own shape.** A workspace written on macOS and opened on Windows carried forward slashes, so the proto file's own directory was passed to protoc twice.
- **Tests no longer write into the real Relay profile on Windows.** They redirected the config directory with the Unix variables only, while `os.UserConfigDir` reads `%AppData%` there — so the suite shared one profile across tests (surfacing as decryption failures) and would have overwritten a developer's own workspace.
- **A manual release checklist** covers what no test can reach: the real installers, the first launch, the update from the previous version, and the uninstall. See `docs/RELEASE-CHECKLIST.md`.

---

## [1.4.0] - 2026-08-13

### Added
- **Request history keeps the response.** An entry used to record only the status line, so there was no way back to what an endpoint actually returned — and the documentation had been promising otherwise. Opening an entry now restores the response into the viewer alongside the request, and a row's ••• menu has **View response** for looking without reopening. Bodies live in their own encrypted files under `history/` rather than in the request store, which is rewritten in full on every save; they are capped at 2 MB, a binary response keeps no body (those bytes do not survive the trip to the interface), and a file is deleted when its entry expires, is deleted, or history is cleared.
- **Variables can be built from other variables.** `baseUrl = {{scheme}}://{{host}}` now resolves, up to a depth of 20, with a circular chain left alone rather than looping.
- **`relay run` obtains its own OAuth 2.0 tokens.** Client credentials and password grants are fetched from the token endpoint; Authorization Code and Device Code fall back to the stored refresh token, which is how they are meant to be renewed unattended. One token is shared by every request in a run that uses the same configuration, and a grant that genuinely needs a browser stops the run with an explanation instead of sending unauthenticated.
- **Authorization tab for WebSocket and Socket.IO.** The sender always applied auth to the handshake; the tab to configure it was missing, so the only route to a protected socket was a hand-written header.
- **SSE reconnection and WebSocket keep-alive are configurable.** All three settings were implemented in Go and had no field in the frontend model, so they sat unreachable for two releases.
- **The `Host` header works.** It was grouped with the framing headers and dropped. It now travels through `Request.Host`, which changes the header without changing where the connection goes. The headers Relay still refuses to send are named in the response panel instead of disappearing silently.

### Fixed
- **Saving a workspace dropped auth fields.** The workspace writer kept a hand-maintained list of which auth fields belong to which type, and it had not been updated since 1.0. A request set to **Inherit Auth** lost the setting entirely and reverted to sending none; AWS session tokens, the Device Code and Password grants, client-authentication methods, and the private-key-JWT configuration — every OAuth field added in 1.2.0 — were discarded on every save. The YAML is the only copy, so what the writer dropped was gone.
- **Any pre-request script corrupted repeated headers and query parameters.** A script's view of them is a map, which cannot hold two rows sharing a key, and the whole map was merged back afterwards. `?id=1&id=2` went out as `?id=2&id=2` and a disabled row came back enabled — for any request running any script, including one that only logged. Only keys a script actually writes are merged now, following Postman's upsert; rows it never names are left exactly as written.
- **OAuth 2.0 tokens were never refreshed for a request that was not on screen.** The refresh read the editor's own fields, so a collection run against an OAuth-protected API started returning 401 the moment the token expired, and a request set to **Inherit Auth** never refreshed at all. It now resolves the auth the request will actually send and writes the new token back where it came from.
- **Importing an OpenAPI spec produced requests that could not be sent.** Path parameters became `{{userId}}` with nothing defining them, the server was pasted into every URL, and declared security schemes were dropped so every request came in as No Auth. The server is now a `{{baseUrl}}` collection variable, path parameters become collection variables seeded from the spec, and `securitySchemes` map onto the request's auth.
- **Generated code dropped Basic, Digest, OAuth 2.0 and AWS auth.** Only Bearer and API keys reached the snippet, so a copied request came back 401 with nothing to say credentials had been left out. Basic and OAuth 2.0 are emitted in every language; cURL gained `--digest` and `--aws-sigv4`; Digest and SigV4 elsewhere open with a comment explaining what to reach for, rather than looking complete. Copying a request as cURL from the sidebar also resolves `{{variables}}` now.
- **The client-certificate passphrase was committed in plain text.** It lives in request settings, which the secret sweep did not cover, so a literal value went into the workspace YAML verbatim. It now becomes a local secret placeholder like every other credential, along with the OAuth password-grant password, the private key, and the AWS session token.
- **Collection variables written by a script were lost** when the script then called `pm.execution.skipRequest()` or failed.
- **A parallel collection run ignored variables written by earlier iterations.** The environment was read once at the start rather than between iterations, so a token fetched in iteration 1 was invisible in iteration 2.
- **SSE requests offered a Scripts tab** that never ran anything — the SSE path does not execute pre-request or test scripts.
- **The realtime panel's tab strip wrapped onto two lines** and the status summary spilled underneath it on a narrow panel — reachable at the minimum window size with the sidebar widened.

### Changed
- The frontend no longer restates the Go structs. Wire types are derived from the generated Wails bindings, which removed 45 hand-written duplicate type definitions and a hand-maintained copy of every bound method signature. CI regenerates the bindings and fails if they differ from what is committed, and `make bindings` is the way to update them. Four of the defects above were the same failure — a hand-maintained copy falling behind — and this is what closes that class.
- Request history now describes what it stores accurately in the README and the privacy page; it previously claimed responses were kept when they were not.

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
