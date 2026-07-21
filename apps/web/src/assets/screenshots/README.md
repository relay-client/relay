# Documentation screenshots

Screenshots in this directory are referenced by the guide pages and optimized by Astro during the site build.

## Reproducible capture

The desktop frontend's full Playwright flow can populate the core guide screenshots with deterministic mock data:

```bash
RELAY_DOCS_SCREENSHOT_DIR="$PWD/apps/web/src/assets/screenshots" \
  npm --workspace @relay/desktop-frontend run e2e -- --project=chromium
```

The capture mode uses a 1440×900 light-theme viewport and writes only when `RELAY_DOCS_SCREENSHOT_DIR` is set. A normal E2E run does not modify documentation assets.

## Suggested set

Each guide page benefits from at least one screenshot. To take the doc site from "good text" to "great visual", capture and save:

| Filename                       | Where shown                                  | What to capture                                              |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| `hero-light.png`               | Landing page hero                            | A wide screenshot of the request editor with response data   |
| `request-editor.png`           | First request guide                          | Filled URL + Send button + bottom response                   |
| `headers-tab.png`              | First request guide                          | Headers tab with 2–3 rows                                    |
| `auth-bearer.png`              | Authentication guide                         | Auth tab with Bearer selected and a masked environment token |
| `auth-oauth2-token-fetch.png`  | Authentication guide                         | OAuth2 client-credentials section with `Fetch token` button  |
| `environments-panel.png`       | Environments guide                           | Environment editor with 4–5 variables, one secret            |
| `workspace-overview.png`       | Workspaces guide                             | The full workspace overview with notes + quick actions       |
| `git-workspace.png`            | Git workspaces guide                         | Git tab with branch, changed YAML files, and diff preview    |
| `sidebar-collections.png`      | Workspaces guide                             | Sidebar with collections, folders, and a starred request     |
| `response-viewer-json.png`     | Response viewer guide                        | JSON response with syntax highlight + line numbers           |
| `response-viewer-search.png`   | Response viewer guide                        | Active search highlighting matches in a body                 |
| `response-viewer-large-body.png` | Response viewer guide                      | Large response paging / virtualization controls              |
| `response-viewer-tests.png`    | Response viewer / Scripting guides           | Test-results panel with assertions and script output         |
| `request-settings.png`         | Per-request settings guide                   | Settings tab open showing toggles                            |
| `request-graphql.png`          | Request types guide                          | GraphQL editor with a successful JSON response               |
| `request-sse.png`              | Request types guide                          | SSE stream connected with several events                     |
| `request-websocket.png`        | Request types guide                          | WebSocket connection with sent and echoed messages           |
| `request-socketio.png`         | Request types guide                          | Socket.IO event emit with acknowledgement                    |
| `request-grpc.png`             | Request types guide                          | gRPC method selection and response messages                  |
| `history.png`                  | Request history guide                        | History panel with grouped days                              |
| `scripting-pre-request.png`    | Scripting guide / Scripting API reference    | Pre-request script with `pm.request.headers.set(...)`        |
| `scripting-tengo.png`          | Scripting guide / Scripting API reference    | Tengo pre-request script and reference snippets              |
| `import-postman.png`           | Migration guide                              | Sidebar import dialog                                        |
| `cookie-jar-populated.png`     | Cookies guide                                | Cookie jar with a saved domain cookie                        |
| `code-snippets.png`            | Code generation guide                        | Side panel with `curl` selected                              |
| `settings-general.png`         | (optional) generic Settings reference        | Settings modal General tab with collapsible cards open       |
| `settings-shortcuts.png`       | Keyboard shortcuts reference                 | Settings → Shortcuts list                                    |

## Capturing tips

- Prefer the automated capture flow for screens it covers.
- Use a 1× DPI window — Retina captures bloat the page weight.
- Resize manual captures to ~1440×900 so the layout stays consistent. Small targeted crops are OK for narrow UI fragments such as `sidebar-collections.png` and `status-bar.png`.
- Use one theme consistently within a guide. The automated set uses the light theme.
- Redact tokens / personal data in image editor before committing.
- Save as PNG. Filenames lowercase-kebab-case.

## Referencing from docs

Once a file is in this directory, import it from a guide:

```mdx
import responseViewer from '../../../assets/screenshots/response-viewer-json.png';
import { Image } from 'astro:assets';

<Image src={responseViewer} alt="JSON response with line numbers and syntax highlight" />
```

Astro's image pipeline will optimize and serve responsive variants automatically.
