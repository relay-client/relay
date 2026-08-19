# Examples — design

An **example** is a saved response paired with the request snapshot that produced
it, stored next to the request in the workspace. It is the unit a mock server
later serves, but it earns its place before any mock exists: it documents what an
endpoint really returns, it is a fixture a test can assert against, and — because
it lives in the Git-backed YAML — a change to it shows up as a reviewable diff.

This document covers the data model, the on-disk shape, the secret handling, and
the order the work is done in. The mock server is out of scope except where a
decision here exists to keep it cheap later.

---

## 1. Scope

**In scope**

- An example belongs to exactly one request.
- It carries a response (status, headers, body) and a snapshot of the request
  that produced it, because the request itself may change afterwards.
- Captured from a real response (the response panel, or a history entry),
  written by hand, or seeded from an imported OpenAPI spec / Postman collection.
- Round-trips through the workspace YAML, the local store, and import/export.

**Out of scope for now**

- Serving examples over HTTP (the mock server).
- Comparing a live response against an example (the diff), beyond keeping the
  data shaped so it is easy.
- Examples on realtime request types (WebSocket, SSE, Socket.IO, gRPC). The model
  allows it; the first slice covers HTTP and GraphQL only.

---

## 2. Data model

```ts
export type RequestExample = {
  id: string;
  name: string;
  filesystemName: string;   // stable Git path segment, same rules as requests
  order: number;

  // What produced this response. Kept whole: the request may have moved on.
  snapshot: {
    method: Method;
    url: string;            // as sent, variables unresolved
    params: KVRow[];
    headers: KVRow[];
    bodyType: BodyType;
    bodyContent: string;
  };

  response: {
    statusCode: number;
    status: string;         // "201 Created"
    headers: KVRow[];
    body: string;
    bodyMediaType: string;  // from Content-Type, drives the body file extension
    durationMs?: number;    // informational only
  };

  // Kept from the start so the mock server needs no migration. Derived on
  // capture; editable later.
  match: {
    pathTemplate: string;   // "/orders/:id" — derived from the URL
    query?: Record<string, string>;
  };

  source: 'captured' | 'manual' | 'openapi' | 'postman';
  createdAt: number;
  notes?: string;
};
```

`SavedRequest` gains `examples?: RequestExample[]`. Optional, so every existing
request and every existing YAML file stays valid.

---

## 3. On-disk shape

Today every request in a collection is one **flat** file under `requests/`.
Sidebar folders are not directories — `folderPath` is a field inside the request
YAML — and `filesystemSegmentsForItems` guarantees each request's
`filesystemName` is unique within its collection:

```
workspaces/<Workspace>/collections/<Collection>/
  collection.yml
  requests/
    Create-order.yml
    Refund.yml
```

**The obvious layout does not work.** Putting examples in a
`requests/Create-order.examples/` directory next to the request looks natural,
but `readYAMLRequestEntriesWithDiagnostics` walks `requests/` with
`filepath.WalkDir` — **recursively**. It skips the directory entry itself and
then descends into it, so every `*.yml` inside would be parsed as a request and
come back as a malformed-request diagnostic.

So examples live in a reserved directory that is a **sibling of `requests/`**,
with one subdirectory per request and the response body in its **own file**:

```
collections/<Collection>/
  collection.yml
  requests/
    Create-order.yml
  examples/                   ← reserved name, never walked by the request loader
    Create-order/
      created.yml
      created.body.json
      rate-limited.yml
      rate-limited.body.json
```

`examples/` sits next to `requests/` and `environments/`, which are already
reserved names, so it needs no skip rule in the request walker. The per-request
subdirectory reuses the request's own `filesystemName`, which is already unique
within the collection and already what names the request file. The example file
also carries `requestId`, so a request renamed on disk can be re-linked by id
rather than orphaned.

`created.yml` holds everything except the body:

```yaml
version: 1
order: 0
example:
  id: ex-created
  requestId: req-create-order
  name: Created
  source: captured
  createdAt: 1787000000000
  snapshot:
    method: POST
    url: "{{baseUrl}}/orders"
    headers:
      - { id: 1, enabled: true, key: Content-Type, value: application/json }
    bodyType: json
    bodyContent: |
      {"amount": 500}
  response:
    statusCode: 201
    status: 201 Created
    bodyMediaType: application/json
    bodyFile: created.body.json
    headers:
      - { id: 1, enabled: true, key: Content-Type, value: application/json }
  match:
    pathTemplate: /orders
```

**Why the body is a separate file.** It is the whole point of putting examples in
Git. A JSON body embedded in YAML is a block scalar: the diff is indentation-
shifted, the reviewer cannot read it, and a formatting change rewrites the entire
block. As its own `.json` file it diffs line by line, and "the contract changed"
becomes something a reviewer can actually see. The extension follows
`bodyMediaType` (`.json`, `.xml`, `.html`, `.txt`), falling back to `.txt`.

A binary body is not written to the workspace at all — the same rule the response
viewer already lives by, since those bytes do not survive the bridge. The example
records the media type and size and carries no body.

### Schema

`schemas/relay-workspace-yaml-v1.schema.json` gains an `exampleFile` variant in
the top-level `oneOf` plus an `example` definition. No change to `requestFile`:
examples never appear inline, so an old Relay reading a new workspace ignores a
directory it does not know, and a new Relay reading an old workspace finds no
examples. Both directions degrade to "no examples", which is the correct
behaviour and needs no version bump.

---

## 4. Secrets

This is the part that can leak. A login response body carries an access token; a
`Set-Cookie` header carries a session. Examples are written to a Git repository.

Three layers, all reusing machinery that already exists:

1. **Exact secret values.** The executor already knows
   `SecretEnvironmentValues` and uses them in `redactSecrets` for script output.
   On capture, every occurrence of a known secret value in the body or headers is
   replaced with the same `{{relaySecret:…}}` placeholder the rest of the
   workspace uses. This is exact, not a guess.

2. **Sensitive keys.** `lib/secretExport.ts` already carries
   `sanitizeExportExample`, which walks parsed JSON and blanks values under keys
   matching `token|password|authorization|secret|api_key|…`. Run it over the
   captured body, and `safeExportRow` over the response headers.

3. **Tell the user.** `bodyHasRawSecret` already reports whether a body still
   holds something that looks like a raw credential. The save dialog shows what
   was redacted and lets the value be restored deliberately — the same
   "include secrets" opt-in the export paths use.

Default is redact. An example that the user opts into keeping raw is marked, and
the workspace diagnostics surface it, so it cannot be forgotten.

---

## 5. Code touch points

**Go**

| File | Change |
|---|---|
| `internal/model/http.go` | no change — examples never reach the sender |
| `internal/api/file_workspace_store.go` | read/write the `*.examples/` directory and body files |
| `internal/api/file_workspace_store_strip.go` | example field defaults, so unchanged fields stay out of the YAML |
| `internal/api/cli_request.go` | `cliExample` decode — the CLI ignores examples for now but must not choke |
| `schemas/…v1.schema.json` | `exampleFile` + `example` defs |

**Frontend**

| File | Change |
|---|---|
| `lib/types/models.ts` | `RequestExample`, `SavedRequest.examples` |
| `lib/normalizers.ts` | normalize/default examples on load |
| `lib/utils.ts` | clone/restore for the store round-trip |
| `lib/stores/features/examples.ts` | **new** — capture, rename, reorder, delete |
| `lib/stores/features/response.ts` | "Save as example" from the response panel |
| `lib/stores/features/history.ts` | "Save as example" from a history entry |
| `lib/postman.ts` | import `item[].response[]`, export back to it |
| `lib/openapi.ts` | import `responses.<code>.content.<type>.example` |
| `lib/opencollection.ts` | round-trip |

Both `postman.ts` and `openapi.ts` currently **discard** this data — Postman
examples live in `item[].response[]` and are never read, and the OpenAPI importer
never looks at `responses` (it only writes a stub `200` on export). So these two
are not just new features; they close an existing data-loss path on import.

**UI**

| Component | Change |
|---|---|
| `components/ExamplesTab.svelte` | **new** — list, rename, reorder, edit, delete |
| `components/RequestEditorTabs.svelte` | the tab, with a count badge |
| `components/ResponsePanel.svelte` | "Save as example" action |
| `components/SidebarRequestRow.svelte` | examples as collapsible children of a request |
| `components/MissingSecretsModal.svelte` sibling | the redaction confirm on capture |

---

## 6. Phases

Each phase is shippable on its own and leaves the tree green.

**Phase 1 — the data. Done.** Model, normalizers, YAML read/write, schema,
secret redaction. `internal/api/file_workspace_store_examples.go` holds the
storage layer, `frontend/src/lib/examples.ts` the model and the redaction, and
both have tests covering the round trip, pruning a deleted example together with
its body file, a workspace written before examples existed, a body pointer that
tries to escape the example directory, and colliding example names.

Two things the implementation changed from what is written above. The pruning
pass only ever removed `*.yml`, so a deleted example would have left its body
file behind for ever — it now also removes files sitting directly inside
`examples/<request>/`. And `pathTemplateFromUrl` has to strip a leading
`{{baseUrl}}`: a Relay URL usually opens with the host in a variable, and
without that the variable became the first path segment.

**Phase 2 — the interface. Done.** An Examples tab with a master-detail list,
"Save as example" in the response panel, rename / reorder / delete, and an
editable status, status text and body so an example can be authored rather than
only captured. `stores/features/examples.ts` holds the operations,
`components/ExamplesTab.svelte` and `ExampleDetail.svelte` the interface. E2E
covers capture → second capture → delete → explicit save → the example is in the
persisted store.

Two things worth recording. The sidebar children in the original sketch were
dropped: the tab already carries the count badge, and hanging examples under a
request row crowds the one part of the interface that is used constantly.
Capturing from a history entry is **not** done — it is carried into phase 3,
where the other ways an example can arrive are built.

More importantly, building this surfaced a **data-loss bug in manual-save mode**
that had nothing to do with examples. `requestsForStore` deliberately substitutes
the last saved version for any request still marked dirty — that is what keeps
unsaved edits off disk. But `saveRequestById` cleared the dirty mark only *after*
the write resolved, so an explicit save was still marked dirty while the payload
was built: it wrote the previous version of the whole request and then reported
success, and the edit was gone on the next load. The mark is now cleared before
the write and restored if the write fails. The e2e test asserts the request's URL
alongside the example, so this cannot regress silently.

**Phase 3 — the other ways an example arrives. Done.** Postman `item.response[]`
both ways, HAR `entry.response`, OpenAPI `responses` (including a value derived
from the response schema when the spec writes no example), OpenCollection
round-trip under its own `examples` key, and "Save as example" from a history
entry.

HAR turned out to be the richest source and the one nobody had noticed: a HAR
file *is* a recording of request/response pairs, and the importer kept only the
request half. Importing one now yields a request with the response it actually
got, already shaped as an example.

Two unrelated Postman losses were found in the same audit and fixed alongside:
`protocolProfileBehavior` (per-request redirect and TLS switches) was read by
nobody, so a collection that turned off redirects imported as one that followed
them; and `url.variable` — the values behind `:pathVariable` — was dropped,
leaving a URL that still said `:id` and could not be sent. Relay has no
per-request path variables, so those values are substituted into the URL.

**Phase 4 — the diff. Done.** The response panel's Diff tab already compared the
current response with the previous one; the baseline can now be a saved example
instead, chosen from a picker in the diff bar. `responseFromExample` presents an
example in the shape a response has, so the diff and the panel needed no
knowledge of examples at all.

The choice is per request. A baseline that disappears — the example was deleted
or the request reloaded — falls back to the previous response rather than
showing nothing, and "Clear baseline" steps back the same way: from an example to
the previous response, and only then out of the tab. The tab itself now appears
whenever there is anything to compare against, which includes a request that has
examples but has only been sent once.

**Phase 5 — the mock server.** A separate design. Everything it needs from this
one is already in `match`.

---

## 7. Decisions taken, and why

**Examples are not inline in the request file.** Inline is less machinery, but
every example edit would rewrite the request file and bury the response body in a
YAML block scalar. Since the reason to have this at all is a reviewable contract,
the storage shape is the feature.

**Examples are not siblings of the request file either.** The request loader
walks `requests/` recursively, so anything ending in `.yml` anywhere under that
tree is read as a request. A reserved `examples/` directory one level up keeps
the walker untouched.

**The request snapshot is stored whole.** Postman does the same. Without it, an
example becomes a lie the moment the request is edited, and there is no way to
tell what actually produced the response.

**`match` exists from day one** even though nothing reads it. It costs two fields
now and saves a workspace migration later.

**No file version bump.** Examples are additive and live in files an older Relay
never opens.
