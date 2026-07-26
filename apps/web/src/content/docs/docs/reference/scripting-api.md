---
title: Scripting API
description: Full pm.* reference for pre-request and test scripts.
---

Scripts run in a sandboxed JavaScript VM by default. Existing requests can still use the legacy [Tengo](https://github.com/d5/tengo) engine. Both engines expose the same `pm.*` surface for request mutation, response assertions, variables, environments, and logs.

Imports, `require`, process access, and filesystem access are disabled. Network access is disabled too, unless a request opts into [`pm.sendRequest`](#pmsendrequest). Execution is capped at 2 seconds by default — see [Script timeout](#script-timeout).

## `pm.request`

| Method | Description |
|--------|-------------|
| `pm.request.url` | Current request URL (string) |
| `pm.request.method` | HTTP method |
| `pm.request.headers.get(name)` | Get request header |
| `pm.request.headers.set(name, value)` | Set / override header |
| `pm.request.headers.unset(name)` | Remove header |
| `pm.request.params.get(name)` | Get query param |
| `pm.request.params.set(name, value)` | Set query param |
| `pm.request.set_url(url)` | Override URL before sending |

## `pm.response` (test scripts only)

| Method | Description |
|--------|-------------|
| `pm.response.code` | HTTP status code (int) |
| `pm.response.status` | Status string, e.g. `"200 OK"` |
| `pm.response.responseTime` | Duration in milliseconds (alias: `pm.response.time`) |
| `pm.response.size` | Body size in bytes |
| `pm.response.body()` | Raw body as string |
| `pm.response.json()` | Body parsed as JSON (map/array) |
| `pm.response.headers.get(name)` | Get response header (case-insensitive) |

## Variable scopes

`pm.variables`, `pm.globals`, `pm.environment`, and `pm.collectionVariables` all expose the same four methods:

| Method | Description |
|--------|-------------|
| `.get(key)` | Read a variable |
| `.set(key, value)` | Write a variable |
| `.unset(key)` | Delete a variable |
| `.clear()` | Clear all variables |

They differ in which scope they touch:

| Scope | Reads | Writes |
|-------|-------|--------|
| `pm.variables` | All scopes, in precedence order: data row → environment → collection → session | The session scope |
| `pm.globals` | The session scope | The session scope |
| `pm.environment` | The active environment | The active environment |
| `pm.collectionVariables` | The request's collection | The request's collection, saved back to the collection after the send |

Relay has a single runtime variable scope, so `pm.globals` and `pm.variables.set` write to the same place — they are aliases, not two separate stores.

Globals persist. They are saved with your data, survive a restart, and are shared across every workspace. Edit them under **Environments → Globals** in the sidebar; a value a script writes appears there after the send. In [`relay run`](/docs/guides/cli-runner/) they come from `--globals` / `--global-var` and can be written back with `--export-globals`.

`pm.collectionVariables.set` persists: after the request finishes, the value is written onto the collection's variables (a Git-backed workspace records it in `collection.yml`). An existing row keeps its id, enabled state, secret flag, and description; only the value changes.

```js
// Cache a value for every later request in the collection.
pm.collectionVariables.set("lastOrderId", pm.response.json().id)
```

## `pm.info`

Read-only facts about the current run.

| Property | Description |
|----------|-------------|
| `pm.info.requestName` | The request's name |
| `pm.info.eventName` | `"prerequest"` or `"test"` |
| `pm.info.iteration` | Current iteration (1-based) |
| `pm.info.iterationCount` | Total iterations in this run |

## `pm.cookies`

Read-only access to the cookies the request's jar would send for this URL. Domain, path, and `Secure` matching is already applied.

| Method | Description |
|--------|-------------|
| `pm.cookies.get(name)` | Cookie value, or `undefined` |
| `pm.cookies.has(name)` | Whether the cookie is present |
| `pm.cookies.names()` | Array of cookie names |

## `pm.execution.skipRequest()`

Called from a **pre-request** script, skips the send entirely. The request is reported as skipped rather than failed, so a conditional request does not fail a collection run or a `relay run` exit code. Calling it from a test script does nothing — the response already exists.

```js
// Only hit the billing API when the environment opts in.
if (pm.environment.get("mode") !== "live") pm.execution.skipRequest()
```

## `pm.crypto`

Hashing, HMAC, and encoding, for signing requests. Every digest function takes an optional encoding — `"hex"` (default), `"base64"`, `"base64url"`, or `"latin1"`.

| Method | Description |
|--------|-------------|
| `pm.crypto.md5(data, enc?)` | MD5 digest |
| `pm.crypto.sha1 / sha256 / sha384 / sha512(data, enc?)` | SHA digest |
| `pm.crypto.hash(algorithm, data, enc?)` | Digest under a named algorithm |
| `pm.crypto.hmacSha1 / hmacSha256 / hmacSha384 / hmacSha512(data, key, enc?)` | HMAC |
| `pm.crypto.hmac(algorithm, data, key, enc?)` | HMAC under a named algorithm |
| `pm.crypto.base64Encode(data)` / `base64Decode(data)` | Base64 |
| `pm.crypto.randomHex(bytes)` | Random hex string (default 16 bytes) |
| `pm.crypto.uuid()` | Random v4 UUID |

Supported algorithms: `md5`, `sha1`, `sha256`, `sha384`, `sha512`, `sha512-256`. An unknown name throws rather than signing with an empty digest.

```js
// Sign the request the way a partner API expects.
const ts = String(Date.now())
const sig = pm.crypto.hmacSha256(pm.request.method + "\n" + ts, pm.environment.get("apiSecret"))
pm.request.headers.set("X-Timestamp", ts)
pm.request.headers.set("X-Signature", sig)
```

### `CryptoJS`

A `CryptoJS` global is available for compatibility with scripts imported from Postman: `MD5`, `SHA1`, `SHA256`, `SHA384`, `SHA512`, the matching `Hmac*` functions, and `enc.Hex` / `enc.Base64` / `enc.Utf8`. It covers the digest and encoding calls that appear in real collections, not the whole library — for new scripts prefer `pm.crypto`.

```js
const sig = CryptoJS.HmacSHA256("payload", pm.environment.get("secret")).toString()
const b64 = CryptoJS.enc.Base64.stringify(CryptoJS.SHA256("payload"))
```

## `pm.sendRequest`

Makes an HTTP call from a script — for fetching a token before the send, or chaining setup. **Off by default:** turn on **Allow pm.sendRequest** in the request's Settings tab, or pass `--allow-send-request` to [`relay run`](/docs/guides/cli-runner/). Without it, the call throws and explains how to enable it.

Both Postman's callback form and a direct return value work; the call is synchronous, so the callback runs immediately rather than on a later tick.

```js
// Callback form — what imported Postman scripts use.
pm.sendRequest({
  method: "POST",
  url: "https://auth.example.com/token",
  header: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
}, (err, res) => {
  if (err) throw err
  pm.request.headers.set("Authorization", "Bearer " + res.json().access_token)
})

// Return-value form.
const res = pm.sendRequest("https://api.example.com/health")
pm.test("dependency is up", () => pm.expect(res.code).to.equal(200))
```

The response object mirrors `pm.response`: `.code`, `.status`, `.responseTime`, `.size`, `.text()`, `.json()`, `.headers.get(name)`, and `.to` for assertions.

Limits and deliberate omissions:

- 30 second timeout, 8 MB response cap, at most 5 redirects.
- The call does **not** inherit the parent request's auth, client certificate, or cookie jar, and does not run scripts of its own. It is a plain HTTP request — anything more would be a hidden second request carrying your credentials.
- A non-2xx status is a normal response, not an error; only a transport failure produces one.

## Script timeout

A script is capped at **2000 ms** by default. Raise it per request with **Script timeout** in the Settings tab, or for a whole run with `relay run --script-timeout`. The ceiling is 60000 ms, so a runaway loop can never wedge a send or a CI job.

## `pm.iterationData`

| Method | Description |
|--------|-------------|
| `.get(key)` | Read the current data-row value for `key` (read-only) |

During a data-driven run — the [Collection Runner](/docs/guides/collection-runner/) with a data file, or [`relay run --data`](/docs/guides/cli-runner/#data-driven-runs) — `pm.iterationData` exposes the current row. It's read-only; outside a data run every key is `undefined`.

```js
pm.test("greets the row's user", () => {
  const body = pm.response.json()
  pm.expect(body.name).to.equal(pm.iterationData.get("name"))
})
```

## Assertions

JavaScript:

```js
pm.test("status is 200", () => pm.response.to.have.status(200))
pm.test("has id", () => pm.expect(pm.response.json()).to.have.property("id"))
```

Tengo:

```js
body := pm.response.json()
pm.test("status is 200", pm.response.code == 200)
pm.test("has id", pm.expect(body).has_key("id"))
```

**`pm.test(name, fnOrResult)`** — register a named assertion. JavaScript accepts a callback or boolean. Tengo accepts a boolean expression.

**`pm.expect(value)`** — chainable assertion builder.

| Chain | Description |
|-------|-------------|
| `.equal(v)` | Strict equality |
| `.not_equal(v)` | Inverse of `equal` |
| `.contains(s)` | Substring or array membership |
| `.exists()` | Not null/undefined |
| `.is_null()` | Strict null check |
| `.greater_than(n)` | `value > n` |
| `.less_than(n)` | `value < n` |
| `.has_key(k)` | Map contains key |
| `.type_of()` | Returns the type as a string (`"string"`, `"int"`, `"map"`, etc.) |

JavaScript also supports Chai-style aliases for the common Postman patterns:

| Chain | Description |
|-------|-------------|
| `.to.equal(v)` | Strict equality |
| `.to.include(v)` | Substring or array membership |
| `.to.have.property(k)` | Object has property |
| `.to.be.above(n)` | `value > n` |
| `.to.be.below(n)` | `value < n` |
| `pm.response.to.have.status(code)` | Response status code check |

## Logging

**`pm.log(...values)`** — prints to the Scripts panel. Accepts any number of arguments, joined with spaces. Useful for debugging — the panel clears on each send.

## Engine notes

- JavaScript is the default engine for new requests and Postman-style scripts.
- Tengo is kept for older requests and teams that already wrote Tengo snippets.
- Both engines use the same variable/environment mutation contract.
- Both engines block imports and host APIs. Use Relay requests and the Collection Runner for chained HTTP calls.

```js
// blocked in JavaScript
require("fs")
import("node:fs")

// blocked in Tengo
json := import("json")
```
