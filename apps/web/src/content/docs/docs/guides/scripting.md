---
title: Scripting
description: Pre-request and test scripts in JavaScript or Tengo — inject headers, assert responses, set variables.
---

Relay scripts run in a sandboxed JavaScript VM by default. Existing requests can still use the legacy [Tengo](https://github.com/d5/tengo) engine. Both engines expose the same `pm.*` API and execution caps at **2 seconds**.

There are two script hooks per request:

- **Pre-request** — runs after variable substitution, before the wire send. Use it to inject auth, set query params, log inputs.
- **Tests** — runs after the response is received. Use it to assert and to extract values for chained requests.

![Pre-request JavaScript in the request Scripts tab](../../../../assets/screenshots/scripting-pre-request.png)

![Legacy Tengo pre-request script in the request Scripts tab](../../../../assets/screenshots/scripting-tengo.png)

## Anatomy of a pre-request script

```js
// Set a trace header for every request
pm.request.headers.set("X-Trace", "relay-" + pm.variables.get("runId"))

// Override the URL conditionally
if (pm.environment.get("region") === "eu") {
  pm.request.set_url("https://eu.api.example.com" + pm.request.url)
}
```

## Anatomy of a test script

```js
pm.test("status is 200", () => pm.response.to.have.status(200))
pm.test("response under 500ms", () => pm.expect(pm.response.responseTime).to.be.below(500))

const body = pm.response.json()
pm.test("has user id", () => pm.expect(body.user).to.have.property("id"))
pm.test("role is admin", () => pm.expect(body.user.role).to.equal("admin"))

// Persist for downstream requests
pm.environment.set("userId", body.user.id)
pm.log("captured userId:", body.user.id)
```

Test results appear in the response **Scripts** panel with pass/fail counts.

## Common patterns

**Chained auth — fetch token in pre-request:** put the login call in a separate request, run it once, persist the token with `pm.environment.set("authToken", ...)`. Downstream requests reference `{{authToken}}`.

**Conditional skip:** scripts don't expose request cancellation; set a header like `X-Skip: true` and assert it in a test instead, or branch in your handler.

**Logging:** `pm.log(...)` writes to the **Scripts** panel. Output is per-request and cleared on next send.

## Limits

- 2-second wall clock per script.
- No imports, `require`, process access, filesystem access, or direct network sockets.
- Scripts can't make their own HTTP calls. Chain requests with saved variables instead.
- Tengo uses expression-style assertions: `pm.test("status", pm.response.code == 200)`.
- JavaScript supports Postman-style callbacks: `pm.test("status", () => pm.response.to.have.status(200))`.

See the full method reference in [Scripting API](/docs/reference/scripting-api/).
