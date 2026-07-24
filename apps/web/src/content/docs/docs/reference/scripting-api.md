---
title: Scripting API
description: Full pm.* reference for pre-request and test scripts.
---

Scripts run in a sandboxed JavaScript VM by default. Existing requests can still use the legacy [Tengo](https://github.com/d5/tengo) engine. Both engines expose the same `pm.*` surface for request mutation, response assertions, variables, environments, and logs.

Imports, `require`, process access, filesystem access, and direct network access are disabled. Execution timeout: 2 seconds.

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

## `pm.variables` / `pm.environment`

| Method | Description |
|--------|-------------|
| `.get(key)` | Read a variable |
| `.set(key, value)` | Write a variable |
| `.unset(key)` | Delete a variable |
| `.clear()` | Clear all variables |

`pm.variables` writes to the session's runtime variable scope (available to later requests in the same run); `pm.environment` writes to the active environment.

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
