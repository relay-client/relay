# Relay Docs Coverage

This matrix keeps documentation work honest. Update it whenever a feature ships or a guide changes.

Last factual audit: **2026-07-24**, against desktop tag **v1.1.1**.

| Area | User docs | Reference / source of truth | Screenshot status | Notes |
|------|-----------|-----------------------------|-------------------|-------|
| Installation and updates | `docs/getting-started/installation`, `docs/troubleshooting` | `privacy`, `changelog`, `.github/workflows/release.yml` | Partial | Signing status is artifact-specific. Updater signatures do not imply installer code signing. |
| First request | `docs/getting-started/first-request` | `docs/reference/keyboard-shortcuts` | Good | Filled request editor, headers tab, and send/response flow are captured. |
| Workspaces, collections, folders | `docs/guides/workspaces`, `docs/guides/collection-defaults` | `docs/reference/relay-yaml-format`, `collectionDefaults.ts`, `constants.ts` | Good | Defaults are collection-level only. Keep folder depth and request caps in sync with code. |
| Request types | `docs/guides/request-types` | `docs/reference/relay-yaml-format` | Good | GraphQL, SSE, WebSocket, Socket.IO, and gRPC flows are captured. |
| Auth | `docs/guides/authentication` | `privacy`, `AuthTab.svelte`, `internal/api/auth` | Good | Bearer and OAuth Client Credentials screens are captured. Authorization Code + PKCE is documented and verified by code/tests; AWS session tokens are not supported. |
| Environments and variables | `docs/guides/environments` | `docs/reference/scripting-api` | Good | Populated environment and masked secret are captured. |
| Cookies | `docs/guides/cookies`, `docs/guides/request-settings` | `privacy` | Good | Empty state and populated domain cookie editor are captured. |
| Response viewer | `docs/guides/response-viewer` | `response.ts`, `executor.go` | Good | JSON body, search, large-body virtualization, metadata, script output, and passing tests are captured. The 10 MB paging threshold, 512 KiB render pages, and 100 MB read cap are verified. |
| Scripting | `docs/guides/scripting` | `docs/reference/scripting-api` | Good | JavaScript and legacy Tengo script surfaces are captured. |
| Import/export | `docs/guides/import-export`, `docs/getting-started/migrating` | `docs/reference/relay-yaml-format` | Good | Import-source selection is captured; backup/restore is split into its own guide. |
| Backup and restore | `docs/guides/backup-recovery`, `docs/faq`, `privacy` | `dataBackup.ts`, `secure_store.go` | Good | Export warning is captured. Plaintext secret-bearing export, exclusions, recovery-key behavior, and destructive restore are documented. |
| Request history | `docs/guides/history` | `history.ts`, `constants.ts` | Good | Populated Today group and restored response are captured. |
| Collection Runner | `docs/guides/collection-runner` | `docs/reference/performance-fixtures` | Good | Completed run with per-request pass status and summary is captured. Parallel runs are capped by the Max concurrent requests setting. |
| CLI runner | `docs/guides/cli-runner` | `internal/api/cli.go`, `cli_request.go`, `cli_data.go` | N/A (terminal) | `relay run` covers HTTP/GraphQL plus test scripts. Data-driven iterations, cli/json/junit reporters with file export, variable scopes and export, and exit codes are documented and covered by Go tests. Realtime types and OAuth2 auto-fetch are out of scope. |
| Client certificates (mTLS) | `docs/guides/request-settings` | `internal/api/client_cert.go`, `transport_cache.go` | Partial | Certificate, optional key, and passphrase are per-request settings that inherit from a collection. Legacy encrypted PEM keys are supported; PKCS#8 requires conversion. |
| Response timeline and diff | `docs/guides/response-viewer` | `internal/api/timing.go`, `sent_request_recorder.go`, `responseDiff.ts` | Partial | Timeline events, connection details, and the on-the-wire request (secret-masked, one block per redirect hop) plus the previous-response diff are documented. |
| Git workspaces | `docs/guides/git-workspaces` | `docs/reference/relay-yaml-format`, `file_workspace_store.go` | Good | Git tab with branch state, changed YAML, and secret placeholders is captured. Secret values live in encrypted local profile; shared YAML contains placeholders. |
| Code generation | `docs/guides/code-generation` | `ui.ts`, `snippets.ts`, `curl.ts` | Good | 14 targets; auth/file support is best-effort and target-specific. |
| App settings | `docs/guides/settings`, `docs/reference/keyboard-shortcuts` | `SettingsModal.svelte`, `preferences.ts` | Good | General, theme, shortcuts, search, updates, and About surfaces have coverage. |
| Global proxy | `docs/guides/proxy`, `docs/troubleshooting` | `proxy.ts`, `proxy.go`, `SettingsModal.svelte` | Good | Configured custom proxy is captured; precedence, bypass, password persistence, and direct behavior are documented. |
| Browser security / CORS / CSP | `docs/guides/browser-security`, `docs/guides/request-settings` | `browser_security.go`, `preflight_cache.go` | Good | Request controls are captured in the per-request Settings tab. Focused guide covers credentials, preflight, response checks, CSP scope, HTTP/SSE, and realtime handshakes. |
| Performance fixtures | `docs/reference/performance-fixtures` | script `perf:fixtures` | Not needed | Keep counts/options in sync with `scripts/generate-perf-fixtures.mjs`. |

## Priority queue

1. Split troubleshooting into install/network/data/git sections if it gets longer than one screen of sidebar navigation.
2. Keep CI checks for internal links, Pagefind output, changelog drift, and code-backed constants green as docs evolve.
3. Refresh deterministic screenshots whenever the desktop UI changes.
