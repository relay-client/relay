import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

type RelayE2EState = {
  store: Record<string, unknown>;
  savedStores: Record<string, unknown>[];
  sentRequests: Array<Record<string, unknown>>;
  sseConnects: Array<Record<string, unknown>>;
  grpcDiscoveries: Array<Record<string, unknown>>;
  sentGrpcRequests: Array<Record<string, unknown>>;
  webSocketConnects: Array<Record<string, unknown>>;
  webSocketMessages: Array<Record<string, unknown>>;
  socketIOConnects: Array<Record<string, unknown>>;
  socketIOEmits: Array<Record<string, unknown>>;
  savedFiles: Array<{ name: string; content: string; path: string }>;
  environment: Record<string, string>;
  calls: string[];
};

declare global {
  interface Window {
    __relayE2E: RelayE2EState;
  }
}

const stepPauseMs = Number.parseInt(process.env.RELAY_E2E_STEP_PAUSE_MS ?? '0', 10);
const responseScreenshotPath = process.env.RELAY_E2E_RESPONSE_SCREENSHOT ?? '';
const docsScreenshotDir = process.env.RELAY_DOCS_SCREENSHOT_DIR ?? '';

async function captureDocsScreenshot(page: Page, name: string) {
  if (!docsScreenshotDir) return;
  await waitForTransientToasts(page);
  await page.screenshot({
    path: join(docsScreenshotDir, `${name}.png`),
    animations: 'disabled',
  });
}

async function tourPause(page: Page, label: string) {
  if (!Number.isFinite(stepPauseMs) || stepPauseMs <= 0) return;
  await page.evaluate((text) => {
    let node = document.getElementById('relay-e2e-tour-label');
    if (!node) {
      node = document.createElement('div');
      node.id = 'relay-e2e-tour-label';
      Object.assign(node.style, {
        position: 'fixed',
        zIndex: '2147483647',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(16, 20, 28, 0.94)',
        color: '#fff',
        font: '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
        pointerEvents: 'none',
      });
      document.body.appendChild(node);
    }
    node.textContent = text;
  }, label);
  await page.waitForTimeout(stepPauseMs);
}

async function installRelayBridge(page: Page, largeResponseBody = '', runtime = 'browser/e2e', docsMode = Boolean(docsScreenshotDir)) {
  await page.addInitScript(({ largeResponseBody, runtime, docsMode }) => {
    localStorage.clear();

    const emptyGitStatus = {
      isRepo: false,
      workspaceRoot: '',
      root: '',
      missingRoot: false,
      branch: '',
      head: '',
      upstream: '',
      upstreamGone: false,
      ahead: 0,
      behind: 0,
      pushCommitCount: 0,
      pushRemote: '',
      operation: '',
      clean: true,
      files: [],
      remotes: [],
      stashes: [],
      error: '',
    };
    const docsGitStatus = {
      ...emptyGitStatus,
      isRepo: true,
      workspaceRoot: '/Users/ada/Projects/relay-workspace',
      root: '/Users/ada/Projects/relay-workspace',
      branch: 'feature/docs-refresh',
      head: '7b3f2a1',
      upstream: 'origin/feature/docs-refresh',
      ahead: 2,
      behind: 1,
      pushCommitCount: 2,
      pushRemote: 'origin',
      clean: false,
      remotes: ['origin'],
      files: [
        { path: 'workspaces/Main/collections/Core-API/requests/Login.yml', index: 'M', worktree: 'M', status: 'modified' },
        { path: 'workspaces/Main/environments/Local.yml', index: 'A', worktree: 'A', status: 'added' },
      ],
      stashes: [{ ref: 'stash@{0}', index: 0, message: 'WIP on feature/docs-refresh: auth experiments' }],
    };
    const currentGitStatus = () => clone(docsMode ? docsGitStatus : emptyGitStatus);
    const initialStore = {
      version: 2,
      activeId: '',
      activeWorkspaceId: 'workspace-e2e',
      activeEnvironmentId: '',
      openIds: [],
      folderCollapsed: {},
      workspaces: [{
        id: 'workspace-e2e',
        name: 'E2E Workspace',
        filesystemName: 'E2E-Workspace',
        description: '',
      }],
      collections: [],
      environments: [],
      requests: [],
      history: [],
      workspaceCookies: {},
    };
    const state = {
      store: initialStore,
      savedStores: [],
      sentRequests: [],
      sseConnects: [],
      grpcDiscoveries: [],
      sentGrpcRequests: [],
      webSocketConnects: [],
      webSocketMessages: [],
      socketIOConnects: [],
      socketIOEmits: [],
      savedFiles: [],
      environment: {},
      calls: [],
      cookies: {},
    };
    const eventHandlers = {};
    const grpcInventoryMethod = {
      fullName: 'shop.Inventory/GetItem',
      service: 'shop.Inventory',
      name: 'GetItem',
      requestType: 'shop.GetItemRequest',
      responseType: 'shop.GetItemResponse',
      exampleMessage: JSON.stringify({ sku: 'sku-example' }, null, 2),
      clientStreaming: false,
      serverStreaming: false,
    };

    function parseStore(payload) {
      try {
        return JSON.parse(payload);
      } catch {
        return initialStore;
      }
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function byteLength(value) {
      return String(value ?? '').length;
    }

    function emit(eventName, payload) {
      for (const callback of eventHandlers[eventName] ?? []) callback(clone(payload));
    }

    function on(eventName, callback) {
      state.calls.push(`event:${eventName}`);
      eventHandlers[eventName] = [...(eventHandlers[eventName] ?? []), callback];
      return () => {
        eventHandlers[eventName] = (eventHandlers[eventName] ?? []).filter(item => item !== callback);
      };
    }

    function parseJsonMaybe(text, fallback = null) {
      try {
        return text ? JSON.parse(text) : fallback;
      } catch {
        return fallback;
      }
    }

    function jsonResponse(req) {
      const isGraphQL = req.bodyType === 'graphql' || req.url.includes('/graphql');
      if (req.url.includes('/large-response')) {
        const bodyText = largeResponseBody || JSON.stringify({
          Status: 0,
          Categories: Array.from({ length: 115 }, (_, categoryIndex) => ({
            Id: categoryIndex,
            Name: `Category ${categoryIndex}`,
            Fields: { Min: 10, Max: 1000, Currency: 'RUB' },
            Products: Object.fromEntries(Array.from({ length: 9 }, (_, productIndex) => [
              `p${productIndex}`,
              {
                Id: categoryIndex * 100 + productIndex,
                Name: `Product ${categoryIndex}-${productIndex}`,
                Provider: `provider-${productIndex % 6}`,
                Enabled: productIndex % 5 !== 0,
                Amount: productIndex * 10,
              },
            ])),
          })),
        });
        return {
          statusCode: 200,
          status: '200 OK',
          headers: [{ key: 'content-type', value: 'application/json' }],
          body: bodyText,
          duration: 42,
          size: bodyText.length,
          preRequestResult: { tests: [], logs: [] },
          testResult: { tests: [], logs: [] },
        };
      }
      const parsedBody = (() => {
        try {
          return req.body ? JSON.parse(req.body) : null;
        } catch {
          return req.body || null;
        }
      })();
      if (req.url.includes('/login')) {
        state.environment = { ...state.environment, sessionId: 'session-from-login' };
      }
      const body = isGraphQL
        ? {
            data: { me: { id: 'user-123', name: 'Relay Tester' } },
            echoedOperation: parsedBody?.operationName ?? null,
          }
        : {
            login: true,
            requestId: 'login-e2e',
            method: req.method,
            url: req.url,
            body: parsedBody,
          };
      const bodyText = JSON.stringify(body, null, 2);
      const testName = req.testScript?.includes('status is 200') ? 'status is 200' : 'backend smoke assertion';
      return {
        statusCode: 200,
        status: '200 OK',
        headers: [
          { key: 'content-type', value: 'application/json' },
          { key: 'x-relay-e2e', value: 'playwright' },
        ],
        body: bodyText,
        duration: isGraphQL ? 31 : 27,
        size: bodyText.length,
        preRequestResult: {
          tests: [],
          logs: req.preRequestScript ? ['pre-request script accepted'] : [],
        },
        testResult: {
          tests: [{ name: testName, passed: true }],
          logs: req.testScript ? ['test script accepted'] : [],
        },
      };
    }

    const app = {
      AppInfo: async () => ({ name: 'Relay', version: 'dev', runtime, goVersion: 'e2e' }),
      LoadWorkspaceDiagnostics: async () => [],
      LoadRequestStore: async () => JSON.stringify(state.store),
      SaveRequestStoreWithError: async (payload) => {
        state.store = parseStore(payload);
        state.savedStores.push(clone(state.store));
        return { ok: true, error: '' };
      },
      SaveRequestStore: async (payload) => {
        state.store = parseStore(payload);
        state.savedStores.push(clone(state.store));
        return true;
      },
      GetEnvironment: async () => ({ ...state.environment }),
      SetEnvironment: async (values) => {
        state.environment = { ...values };
      },
      SendRequest: async (req) => {
        state.sentRequests.push(clone(req));
        return jsonResponse(req);
      },
      SendRequestToFile: async (req, defaultName) => {
        const response = await app.SendRequest(req);
        const savedPath = await app.SaveFileDialog(defaultName || 'response.json', response.body);
        return { response, savedPath };
      },
      SSEConnect: async (sessionId, req) => {
        state.sseConnects.push({ sessionId, request: clone(req) });
        const timestamp = Date.now();
        emit('sse:open', {
          sessionId,
          url: req.url,
          statusCode: 200,
          status: '200 OK',
          headers: [
            { key: 'content-type', value: 'text/event-stream' },
            { key: 'x-relay-e2e', value: 'sse' },
          ],
          duration: 18,
          timestamp,
        });
        emit('sse:events', {
          sessionId,
          events: [
            {
              id: 'evt-1',
              event: 'notification',
              data: JSON.stringify({ title: 'Build finished', channel: 'deployments' }),
              timestamp: timestamp + 1,
            },
            {
              id: 'evt-2',
              event: 'message',
              data: JSON.stringify({ text: 'Relay stream is live' }),
              timestamp: timestamp + 2,
            },
          ],
        });
      },
      SSEDisconnect: async (sessionId) => {
        emit('sse:close', { sessionId, message: 'SSE disconnected by E2E', timestamp: Date.now() });
      },
      GrpcDiscover: async (req) => {
        state.grpcDiscoveries.push(clone(req));
        return {
          source: req.useReflection ? 'reflection' : 'proto',
          services: [grpcInventoryMethod.service],
          methods: [grpcInventoryMethod],
        };
      },
      SendGrpcRequest: async (req) => {
        state.sentGrpcRequests.push(clone(req));
        const message = parseJsonMaybe(req.message, {});
        const sku = message?.sku ?? 'sku-example';
        const responseBody = JSON.stringify({ sku, stock: 7, warehouse: 'e2e-main' }, null, 2);
        const timestamp = Date.now();
        return {
          grpcCode: 'OK',
          grpcMessage: '',
          status: 'OK',
          headers: [
            { key: 'content-type', value: 'application/grpc+json' },
            { key: 'x-relay-e2e', value: 'grpc' },
          ],
          trailers: [
            { key: 'grpc-status', value: '0' },
            { key: 'x-grpc-trailer', value: 'complete' },
          ],
          messages: [
            { index: 0, direction: 'outgoing', body: req.message, size: byteLength(req.message), timestamp },
            { index: 1, direction: 'incoming', body: responseBody, size: byteLength(responseBody), timestamp: timestamp + 5 },
          ],
          body: responseBody,
          duration: 42,
          size: byteLength(req.message) + byteLength(responseBody),
          timestamp: timestamp + 5,
          error: '',
          method: { ...grpcInventoryMethod, fullName: req.fullMethod || grpcInventoryMethod.fullName },
          preRequestResult: { tests: [], logs: req.preRequestScript ? ['grpc pre-request script accepted'] : [] },
          testResult: { tests: [], logs: req.testScript ? ['grpc test script accepted'] : [] },
        };
      },
      WebSocketConnect: async (sessionId, req) => {
        state.webSocketConnects.push({ sessionId, request: clone(req) });
        emit('ws:open', {
          sessionId,
          url: req.url,
          status: '101 Switching Protocols',
          protocol: 'relay-e2e',
          requestHeaders: req.headers ?? [],
          responseHeaders: [
            { key: 'upgrade', value: 'websocket' },
            { key: 'sec-websocket-accept', value: 'mock-accept' },
          ],
          timestamp: Date.now(),
        });
      },
      WebSocketDisconnect: async (sessionId) => {
        emit('ws:close', { sessionId, message: 'Disconnected by E2E', code: 1000, timestamp: Date.now() });
      },
      WebSocketSend: async (sessionId, msg) => {
        state.webSocketMessages.push({ sessionId, message: clone(msg) });
        const payload = msg.type === 'ping' ? 'pong' : `echo:${msg.data}`;
        emit('ws:event', {
          sessionId,
          event: {
            id: `ws-in-${Date.now()}`,
            direction: 'incoming',
            type: msg.type === 'ping' ? 'pong' : msg.type,
            data: payload,
            encoding: msg.encoding ?? 'plain',
            size: byteLength(payload),
            timestamp: Date.now(),
            isSystem: msg.type === 'ping',
            isError: false,
            message: msg.type === 'ping' ? 'pong' : '',
          },
        });
        return { ok: true };
      },
      SocketIOConnect: async (sessionId, req) => {
        const namespace = req.sioNamespace || '/';
        state.socketIOConnects.push({ sessionId, request: clone(req) });
        emit('sio:open', {
          sessionId,
          url: req.url,
          namespace,
          requestHeaders: req.headers ?? [],
          responseHeaders: [{ key: 'x-socket-io', value: 'relay-e2e' }],
          statusCode: 101,
          statusText: '101 Switching Protocols',
          timestamp: Date.now(),
        });
      },
      SocketIODisconnect: async (sessionId) => {
        emit('sio:close', { sessionId, message: 'Socket.IO disconnected by E2E', timestamp: Date.now() });
      },
      SocketIOEmit: async (sessionId, msg) => {
        state.socketIOEmits.push({ sessionId, message: clone(msg) });
        const namespace = msg.namespace || '/';
        const timestamp = Date.now();
        emit('sio:event', {
          sessionId,
          event: {
            id: `sio-in-${timestamp}`,
            direction: 'incoming',
            eventName: msg.eventName,
            args: [JSON.stringify({ ok: true, echo: parseJsonMaybe(msg.args?.[0], msg.args?.[0] ?? '') })],
            namespace,
            timestamp,
            isSystem: false,
            isError: false,
          },
        });
        if (msg.ack) {
          emit('sio:ack', {
            sessionId,
            ackId: 1,
            eventName: msg.eventName,
            args: [JSON.stringify({ accepted: true })],
            namespace,
            timestamp: timestamp + 1,
          });
        }
        return { ok: true, ackId: msg.ack ? 1 : undefined };
      },
      CancelRequest: async (requestId) => {
        state.calls.push(`cancel:${requestId}`);
      },
      SaveFileDialog: async (name, content) => {
        const path = `/tmp/relay-e2e-${state.savedFiles.length + 1}-${name}`;
        state.savedFiles.push({ name, content, path });
        return path;
      },
      OpenFileDialog: async () => '',
      ReadTextFile: async () => '',
      DefaultWorkspaceLocation: async () => ({ path: '', error: '' }),
      GitStatus: async () => currentGitStatus(),
      GitCommitLogPage: async (limit, offset) => ({
        git: currentGitStatus(),
        commits: docsMode ? [
          { hash: '7b3f2a19f2d4', shortHash: '7b3f2a1', author: 'Ada Lovelace', date: '2026-06-16', message: 'Document OAuth workspace secrets' },
          { hash: '4a92c81bb114', shortHash: '4a92c81', author: 'Relay Bot', date: '2026-06-15', message: 'Refresh generated workspace YAML' },
        ] : [],
        limit,
        offset,
        hasMore: false,
        error: '',
        output: '',
      }),
      GitBranches: async () => ({
        ok: true,
        git: currentGitStatus(),
        current: docsMode ? 'feature/docs-refresh' : '',
        localBranches: docsMode ? [
          { name: 'feature/docs-refresh', fullName: 'feature/docs-refresh', remote: '', current: true, upstream: 'origin/feature/docs-refresh' },
          { name: 'main', fullName: 'main', remote: '', current: false, upstream: 'origin/main' },
        ] : [],
        remoteBranches: docsMode ? [
          { name: 'origin/main', fullName: 'refs/remotes/origin/main', remote: 'origin', current: false, upstream: '' },
        ] : [],
        error: '',
        output: '',
      }),
      GitDiff: async (path) => ({
        path,
        diff: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@\n auth:\n   type: oauth2\n+  oauth2RefreshToken: "{{relaySecret:request.req-login.auth.oauth2RefreshToken}}"\n settings:\n   timeoutMs: 30000\n`,
        stagedDiff: '',
        unstagedDiff: `+  oauth2RefreshToken: "{{relaySecret:request.req-login.auth.oauth2RefreshToken}}"`,
        binary: false,
        truncated: false,
        error: '',
      }),
      ListCookies: async (workspaceId) => state.cookies[workspaceId] ?? [],
      ClearCookies: async (workspaceId) => {
        state.cookies[workspaceId] = [];
        return [];
      },
      UpsertCookie: async (workspaceId, cookie) => {
        const next = [...(state.cookies[workspaceId] ?? []), cookie];
        state.cookies[workspaceId] = next;
        return { cookies: next, error: '' };
      },
      DeleteCookie: async (workspaceId, cookie) => {
        const next = (state.cookies[workspaceId] ?? []).filter(item => item.name !== cookie.name);
        state.cookies[workspaceId] = next;
        return { cookies: next, error: '' };
      },
      ClipboardSet: async (text) => {
        state.calls.push(`clipboard:${text.length}`);
      },
      CheckForUpdate: async () => ({ info: null, error: '' }),
    };

    window.__relayE2E = state;
    window.go = { api: { App: app } };
    window.runtime = {
      EventsOn: on,
      BrowserOpenURL: (url) => state.calls.push(`open:${url}`),
      WindowIsMaximised: async () => false,
      WindowMinimise: async () => {},
      WindowToggleMaximise: async () => {},
      WindowSetLightTheme: async () => {},
      WindowSetDarkTheme: async () => {},
      WindowSetBackgroundColour: async () => {},
    };
  }, { largeResponseBody, runtime, docsMode });
}

async function fillPrompt(page: Page, title: string, value: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await dialog.locator('input').fill(value);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

async function chooseRequestType(page: Page, label: string) {
  const dialog = page.getByRole('dialog', { name: 'New request' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: new RegExp(label) }).click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
}

async function fillCodeEditor(page: Page, testId: string, value: string) {
  const editor = page.getByTestId(testId).locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await page.keyboard.insertText(value);
}

async function expectResponseTabsToFit(page: Page) {
  await expect.poll(async () => page.locator('.response-status-bar').evaluate((bar) => {
    const statusLeft = bar.querySelector<HTMLElement>('.status-left');
    const statusRight = bar.querySelector<HTMLElement>('.status-right');
    const tabs = bar.querySelector<HTMLElement>('.response-mini-tabs');
    const actions = bar.querySelector<HTMLElement>('.resp-actions');
    const buttons = [...bar.querySelectorAll<HTMLElement>('.response-mini-tabs button')];
    if (!statusLeft || !statusRight || !tabs || !actions || !buttons.length) return false;
    const barRect = bar.getBoundingClientRect();
    const leftRect = statusLeft.getBoundingClientRect();
    const rightRect = statusRight.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const labelsFit = buttons.every(button => button.scrollWidth <= button.clientWidth + 1);
    const active = bar.querySelector<HTMLElement>('.response-mini-tabs button.active');
    const activeRect = active?.getBoundingClientRect();
    const activeInsideBar = !activeRect || (activeRect.top >= barRect.top - 1 && activeRect.bottom <= barRect.bottom + 1);
    const groupsStayInsideBar = leftRect.left >= barRect.left - 1 && rightRect.right <= barRect.right + 1;
    const groupsDoNotOverlap = leftRect.right <= rightRect.left - 4;
    return labelsFit && activeInsideBar && groupsStayInsideBar && groupsDoNotOverlap && tabsRect.right <= actionsRect.left - 4;
  })).toBe(true);
}

async function expectScriptResultsPanelLayout(page: Page) {
  await expect.poll(async () => page.locator('.test-results-panel').evaluate((panel) => {
    const blocks = [...panel.querySelectorAll<HTMLElement>('.script-result-block')];
    if (!blocks.length) return false;
    const previousScrollTop = panel.scrollTop;
    const panelRect = panel.getBoundingClientRect();
    const blocksHaveOwnContent = blocks.every(block => block.scrollHeight <= block.clientHeight + 1);

    panel.scrollTop = 0;
    const firstBlockRect = blocks[0].getBoundingClientRect();
    const firstHeader = blocks[0].querySelector<HTMLElement>('.script-result-header');
    const firstHeaderRect = firstHeader?.getBoundingClientRect();
    const firstBlockStartsInsidePanel = firstBlockRect.top >= panelRect.top + 8 && firstBlockRect.top < panelRect.bottom;
    const firstHeaderVisible = !firstHeaderRect || (firstHeaderRect.top >= panelRect.top + 8 && firstHeaderRect.bottom <= panelRect.bottom);

    panel.scrollTop = panel.scrollHeight;
    const lastBlock = blocks[blocks.length - 1];
    const lastRow = lastBlock.querySelector<HTMLElement>(':scope > :last-child');
    if (!lastRow) {
      panel.scrollTop = previousScrollTop;
      return false;
    }
    panel.scrollTop = panel.scrollHeight;
    const rowRect = lastRow.getBoundingClientRect();
    const reachedEnd = Math.ceil(panel.scrollTop + panel.clientHeight) >= panel.scrollHeight - 1;
    const lastRowVisible = rowRect.bottom <= panelRect.bottom - 8 && rowRect.top >= panelRect.top;

    panel.scrollTop = 0;
    return blocksHaveOwnContent && firstBlockStartsInsidePanel && firstHeaderVisible && reachedEnd && lastRowVisible;
  })).toBe(true);
}

async function maybeCaptureResponseScreenshot(page: Page) {
  if (!responseScreenshotPath) return;
  await page.screenshot({ path: responseScreenshotPath });
}

async function waitForTransientToasts(page: Page) {
  await page.locator('.curl-toast').waitFor({ state: 'hidden', timeout: 2500 }).catch(() => {});
}

function collectionRow(page: Page, name: string) {
  return page.locator('.collection-group').filter({ hasText: name }).first();
}

function folderRow(page: Page, name: string) {
  return page.locator('.collection-subfolder').filter({ hasText: name }).first();
}

async function addRequestFromFolder(page: Page, folderName: string, requestTypeLabel: string) {
  await page.getByRole('button', { name: 'Collections' }).click();
  const folder = folderRow(page, folderName);
  await folder.getByLabel('Folder menu').click();
  await folder.locator('.folder-menu').getByRole('button', { name: 'Add request' }).click();
  await chooseRequestType(page, requestTypeLabel);
}

async function chooseRequestSection(page: Page, section: string) {
  const compactTrigger = page.getByRole('button', { name: 'Request section', exact: true });
  if (await compactTrigger.isVisible()) {
    await compactTrigger.click();
    await page.getByRole('option', { name: section }).click();
    return;
  }
  await page.locator('.request-editor-tabs-shell').getByRole('tab', { name: section }).click();
}

test.describe('Relay desktop browser E2E', () => {
  test('keeps the macOS workspace switcher clear of search with the code panel open', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await installRelayBridge(page, '', 'darwin/e2e');
    await page.goto('/');

    await page.getByLabel('New unsaved request').click();
    await chooseRequestType(page, 'HTTP Request');
    await page.getByLabel('Code snippet', { exact: true }).click();
    await expect(page.locator('.code-snippet-panel')).toBeVisible();
    const toolbarOpenFrames = await page.locator('.searchbar-right').evaluate((actions) => new Promise<number[]>((resolve) => {
      const frames: number[] = [];
      const sample = () => {
        frames.push(actions.getBoundingClientRect().x);
        if (frames.length >= 8) {
          resolve(frames);
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    expect(Math.max(...toolbarOpenFrames) - Math.min(...toolbarOpenFrames)).toBeLessThanOrEqual(0.1);
    await expect(page.locator('.global-search span')).toBeVisible();
    const searchIcon = page.locator('.global-search > svg');
    await expect.poll(async () => (await searchIcon.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(13);
    await page.getByLabel('Code snippet', { exact: true }).click();
    await expect(page.locator('.code-snippet-panel')).toBeHidden();
    await page.getByLabel('Code snippet', { exact: true }).click();
    await expect(page.locator('.code-snippet-panel')).toBeVisible();
    await expect.poll(async () => (await searchIcon.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(13);

    const tabStrip = page.locator('.request-tab-strip');
    const savedTabs = page.locator('.saved-request-tabs');
    const overviewTab = page.getByRole('tab', { name: 'Overview' });
    const newRequestButton = page.getByLabel('New unsaved request');
    for (let index = 0; index < 2; index += 1) {
      await newRequestButton.click();
      await chooseRequestType(page, 'HTTP Request');
    }
    await expect(tabStrip).toHaveCSS('border-top-style', 'none');
    await expect(tabStrip).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(overviewTab).toHaveText('Overview');
    await expect.poll(async () => overviewTab.evaluate((tab) => tab.closest('.saved-request-tabs') !== null)).toBe(true);
    await expect.poll(async () => savedTabs.evaluate((tabs) => tabs.scrollWidth > tabs.clientWidth)).toBe(true);
    await savedTabs.evaluate((tabs) => {
      tabs.scrollLeft = tabs.scrollWidth;
    });
    await expect.poll(async () => savedTabs.evaluate((tabs) => {
      const overview = tabs.querySelector<HTMLElement>('.overview-request-tab');
      if (!overview) return false;
      return overview.getBoundingClientRect().right <= tabs.getBoundingClientRect().left;
    })).toBe(true);
    await expect.poll(async () => tabStrip.evaluate((strip) => {
      const tabs = strip.querySelector<HTMLElement>('.saved-request-tabs');
      const create = strip.querySelector<HTMLElement>('.new-request-tab-btn');
      if (!tabs || !create) return false;
      const stripBox = strip.getBoundingClientRect();
      const tabsBox = tabs.getBoundingClientRect();
      const createBox = create.getBoundingClientRect();
      return tabsBox.right <= createBox.left
        && createBox.right <= stripBox.right
        && createBox.width >= 32;
    })).toBe(true);
    await expect(newRequestButton).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
    await expect(newRequestButton).toHaveCSS('border-radius', '7px');

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.locator('.global-search span')).toBeHidden();
    await expect(searchIcon).toHaveAttribute('viewBox', '0 0 24 24');
    await expect.poll(async () => page.locator('.global-search').evaluate((search) => {
      const icon = search.querySelector<SVGElement>(':scope > svg');
      if (!icon) return false;
      const searchBox = search.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      const horizontalOffset = Math.abs(
        (iconBox.left + iconBox.width / 2) - (searchBox.left + searchBox.width / 2),
      );
      const verticalOffset = Math.abs(
        (iconBox.top + iconBox.height / 2) - (searchBox.top + searchBox.height / 2),
      );
      return horizontalOffset <= 0.5 && verticalOffset <= 0.5;
    })).toBe(true);

    const toolbarButtons = page.locator('.searchbar-right > .save-btn, .searchbar-right > .searchbar-settings-btn');
    const toolbarButtonCount = await toolbarButtons.count();
    const toolbarGeometry = async () => toolbarButtons.evaluateAll((buttons) => buttons.map((button) => {
      const buttonBox = button.getBoundingClientRect();
      const iconBox = button.querySelector('svg')?.getBoundingClientRect();
      return {
        buttonX: buttonBox.x,
        buttonY: buttonBox.y,
        buttonWidth: buttonBox.width,
        buttonHeight: buttonBox.height,
        iconX: iconBox?.x ?? 0,
        iconY: iconBox?.y ?? 0,
        iconWidth: iconBox?.width ?? 0,
        iconHeight: iconBox?.height ?? 0,
      };
    }));
    const toolbarBeforeHover = await toolbarGeometry();
    for (let index = 0; index < toolbarButtonCount; index += 1) {
      await toolbarButtons.nth(index).hover();
      const toolbarDuringHover = await toolbarGeometry();
      expect(toolbarDuringHover).toEqual(toolbarBeforeHover);
    }
    for (const item of toolbarBeforeHover) {
      expect(Number.isInteger(item.iconX)).toBe(true);
      expect(Number.isInteger(item.iconY)).toBe(true);
    }
    await expect.poll(async () => page.locator('.workspace-searchbar').evaluate((header) => {
      const actions = header.querySelector<HTMLElement>('.searchbar-right');
      if (!actions) return false;
      return actions.scrollWidth === actions.clientWidth
        && actions.getBoundingClientRect().right <= header.getBoundingClientRect().right + 1;
    })).toBe(true);
    const runnerButton = page.getByRole('button', { name: 'Collection runner', exact: true });
    const runnerIcon = runnerButton.locator('svg');
    await page.locator('.request-editor').hover();
    const runnerIconBeforeHover = await runnerIcon.screenshot({ animations: 'disabled' });
    await runnerButton.hover();
    const runnerIconDuringHover = await runnerIcon.screenshot({ animations: 'disabled' });
    expect(runnerIconDuringHover.equals(runnerIconBeforeHover)).toBe(true);

    const requestSectionButton = page.getByRole('button', { name: 'Request section', exact: true });
    await expect(requestSectionButton).toBeVisible();
    await requestSectionButton.click();
    const requestSectionList = page.getByRole('listbox', { name: 'Request sections' });
    await expect(requestSectionList).toBeVisible();
    await expect(requestSectionList.getByRole('option', { name: 'Settings', exact: true })).toBeVisible();
    await requestSectionList.getByRole('option', { name: 'Body' }).click();
    const bodyModeRow = page.locator('.body-mode-row');
    const bodyTypeButton = page.getByRole('button', { name: 'Body type', exact: true });
    await expect(bodyTypeButton).toBeVisible();
    await bodyTypeButton.click();
    await expect(page.getByRole('listbox', { name: 'Body types' })).toBeVisible();
    await page.getByRole('option', { name: 'raw', exact: true }).click();

    const rawTypeButton = page.locator('.raw-type-button');
    const beautifyButton = bodyModeRow.getByRole('button', { name: 'Beautify', exact: true });
    await expect(rawTypeButton).toBeVisible();
    await expect(beautifyButton).toBeVisible();
    await expect.poll(async () => {
      const [rawBox, beautifyBox] = await Promise.all([
        rawTypeButton.boundingBox(),
        beautifyButton.boundingBox(),
      ]);
      if (!rawBox || !beautifyBox) return false;
      return Math.abs(
        (rawBox.y + rawBox.height / 2) - (beautifyBox.y + beautifyBox.height / 2),
      ) <= 1;
    }).toBe(true);

    const compactBodyLayout = await bodyModeRow.evaluate((row) => {
      const content = row.nextElementSibling;
      return {
        rowHeight: row.getBoundingClientRect().height,
        contentTop: content?.getBoundingClientRect().top ?? 0,
      };
    });
    await bodyTypeButton.click();
    await expect(page.getByRole('listbox', { name: 'Body types' })).toBeVisible();
    await expect.poll(async () => bodyModeRow.evaluate((row, before) => {
      const content = row.nextElementSibling;
      return row.getBoundingClientRect().height === before.rowHeight
        && (content?.getBoundingClientRect().top ?? 0) === before.contentTop;
    }, compactBodyLayout)).toBe(true);
    await page.getByRole('option', { name: 'x-www-form-urlencoded', exact: true }).click();

    const compactKvTable = page.locator('.tab-content .headers-kv-table');
    await expect(compactKvTable).toBeVisible();
    await expect.poll(async () => compactKvTable.evaluate((table) => {
      const head = table.querySelector<HTMLElement>('.kv-head');
      const row = table.querySelector<HTMLElement>('.kv-row');
      const descriptionHead = head?.querySelectorAll<HTMLElement>('.kv-head-cell')[2];
      const descriptionInput = row?.querySelectorAll<HTMLElement>('.kv-input')[2];
      if (!head || !row || !descriptionHead || !descriptionInput) return false;

      const tableBox = table.getBoundingClientRect();
      const descriptionHeadBox = descriptionHead.getBoundingClientRect();
      const descriptionInputBox = descriptionInput.getBoundingClientRect();
      return table.scrollWidth <= table.clientWidth + 1
        && descriptionHeadBox.width >= 56
        && descriptionHeadBox.right <= tableBox.right + 1
        && descriptionInputBox.right <= tableBox.right + 1;
    })).toBe(true);
    await expect(page.getByLabel('Resize key column')).toBeHidden();
    await expect(page.getByLabel('Resize value column')).toBeHidden();
    await expect(page.getByLabel('Resize panels')).toHaveCSS('height', '7px');
    await expect.poll(async () => compactKvTable.evaluate((table) => {
      const tabContent = table.closest<HTMLElement>('.tab-content');
      if (!tabContent) return false;
      const scrollbarColor = getComputedStyle(tabContent).scrollbarColor;
      return scrollbarColor !== 'auto'
        && scrollbarColor !== ''
        && !scrollbarColor.includes('rgb(206, 212, 218)');
    })).toBe(true);

    await chooseRequestSection(page, 'Headers');
    const headersTable = page.locator('.tab-content .headers-kv-table');
    const panelDivider = page.getByLabel('Resize panels');
    const headerActionGeometry = async () => headersTable.evaluate((table) => {
      const content = table.closest<HTMLElement>('.tab-content');
      const remove = table.querySelector<HTMLElement>('.kv-del');
      if (!content || !remove) return null;

      const contentBox = content.getBoundingClientRect();
      const tableBox = table.getBoundingClientRect();
      const removeBox = remove.getBoundingClientRect();
      return {
        tableWidth: tableBox.width,
        removeLeft: removeBox.left,
        removeWidth: removeBox.width,
        rightClearance: contentBox.left + content.clientWidth - removeBox.right,
        scrollable: content.scrollHeight > content.clientHeight,
      };
    });
    const headersBeforeScroll = await headerActionGeometry();
    expect(headersBeforeScroll).not.toBeNull();
    for (let index = 0; index < 12; index += 1) await panelDivider.press('ArrowUp');
    await expect.poll(async () => (await headerActionGeometry())?.scrollable ?? false).toBe(true);
    const headersWithScroll = await headerActionGeometry();
    expect(headersWithScroll).not.toBeNull();
    if (headersBeforeScroll && headersWithScroll) {
      expect(Math.abs(headersWithScroll.tableWidth - headersBeforeScroll.tableWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(headersWithScroll.removeLeft - headersBeforeScroll.removeLeft)).toBeLessThanOrEqual(1);
      expect(Math.abs(headersWithScroll.removeWidth - headersBeforeScroll.removeWidth)).toBeLessThanOrEqual(1);
      expect(headersWithScroll.rightClearance).toBeGreaterThanOrEqual(7);
    }
    for (let index = 0; index < 12; index += 1) await panelDivider.press('ArrowDown');

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.locator('.global-search span')).toBeVisible();

    const codePanelResizer = page.getByLabel('Resize code snippet panel');
    await expect(codePanelResizer).toHaveCSS('cursor', 'col-resize');
    expect(await codePanelResizer.evaluate((resizer) => getComputedStyle(resizer, '::after').content)).toBe('none');
    await expect.poll(async () => page.locator('.workspace-searchbar').evaluate((header) => {
      const workspace = header.querySelector<HTMLElement>('.workspace-switcher-trigger');
      const search = header.querySelector<HTMLElement>('.global-search');
      const actions = header.querySelector<HTMLElement>('.searchbar-right');
      const codePanel = document.querySelector<HTMLElement>('.code-snippet-panel');
      if (!workspace || !search || !actions || !codePanel) return false;

      const headerBox = header.getBoundingClientRect();
      const workspaceBox = workspace.getBoundingClientRect();
      const searchBox = search.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      const codePanelBox = codePanel.getBoundingClientRect();
      return workspaceBox.right <= searchBox.left
        && searchBox.right <= actionsBox.left
        && actionsBox.right <= codePanelBox.left
        && headerBox.right <= codePanelBox.left;
    })).toBe(true);

    await page.setViewportSize({ width: 1440, height: 800 });
    const resizerBox = await codePanelResizer.boundingBox();
    expect(resizerBox).not.toBeNull();
    if (!resizerBox) return;
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(300, resizerBox.y + 80);
    await page.mouse.up();

    await expect.poll(async () => page.locator('.workspace').evaluate((workspace) => {
      const codePanel = document.querySelector<HTMLElement>('.code-snippet-panel');
      if (!codePanel) return false;
      const workspaceBox = workspace.getBoundingClientRect();
      const codePanelBox = codePanel.getBoundingClientRect();
      const availableWidth = workspaceBox.width;
      const editorWidth = codePanelBox.left - workspaceBox.left;
      return editorWidth >= 560 && codePanelBox.width <= availableWidth / 2 + 1;
    })).toBe(true);

    await page.getByLabel('Code snippet', { exact: true }).click();
    await expect(page.locator('.code-snippet-panel')).toBeHidden();
    await expect(requestSectionButton).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.locator('.request-editor-tabs-shell')).not.toHaveClass(/compact/);
    await chooseRequestSection(page, 'Body');
    await page.locator('.body-mode-label:has(input[value="raw"])').click();
    await expect(page.getByRole('button', { name: 'Body type', exact: true })).toBeHidden();
    await expect.poll(async () => bodyModeRow.evaluate((row) => {
      const binaryLabel = Array.from(row.querySelectorAll<HTMLElement>('.body-mode-label'))
        .find((label) => label.textContent?.trim() === 'binary');
      const rawType = row.querySelector<HTMLElement>('.raw-type-menu');
      const beautify = row.querySelector<HTMLElement>('.body-mode-beautify');
      if (!binaryLabel || !rawType || !beautify) return false;

      const rowBox = row.getBoundingClientRect();
      const binaryBox = binaryLabel.getBoundingClientRect();
      const rawTypeBox = rawType.getBoundingClientRect();
      const beautifyBox = beautify.getBoundingClientRect();
      return rawTypeBox.left >= binaryBox.right
        && rawTypeBox.left - binaryBox.right <= 16
        && beautifyBox.left > rawTypeBox.right
        && rowBox.right - beautifyBox.right <= 16;
    })).toBe(true);
  });

  test('keeps the Windows titlebar actions clear of search at scaled-window width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installRelayBridge(page, '', 'windows/e2e');
    await page.goto('/');

    await page.getByLabel('New collection').click();
    await fillPrompt(page, 'New collection', 'Windows UI');
    await collectionRow(page, 'Windows UI').getByLabel('Collection menu').click();
    await collectionRow(page, 'Windows UI').locator('.collection-menu').getByRole('button', { name: 'Add request' }).click();
    await chooseRequestType(page, 'HTTP Request');
    await page.getByLabel('Request name').fill('Cursor request');
    await page.getByLabel('Request name').press('Enter');
    await expect(page.locator('.win-controls')).toBeVisible();
    await expect(page.locator('.save-btn').first()).toBeVisible();
    await expect(page.locator('.collection-request').filter({ hasText: 'Cursor request' })).toHaveCSS('cursor', 'default');
    await expect(page.locator('.saved-request-tab').filter({ hasText: 'Cursor request' }).getByRole('tab')).toHaveCSS('cursor', 'default');

    const expectHeaderNotToOverlap = async () => {
      const [header, search, save, settings, controls] = await Promise.all([
        page.locator('.workspace-searchbar').boundingBox(),
        page.locator('.global-search').boundingBox(),
        page.locator('.save-btn').first().boundingBox(),
        page.getByLabel('Settings', { exact: true }).boundingBox(),
        page.locator('.win-controls').boundingBox(),
      ]);

      expect(header).not.toBeNull();
      expect(search).not.toBeNull();
      expect(save).not.toBeNull();
      expect(settings).not.toBeNull();
      expect(controls).not.toBeNull();
      if (!header || !search || !save || !settings || !controls) return;

      expect(search.x + search.width).toBeLessThanOrEqual(save.x);
      expect(settings.x + settings.width).toBeLessThanOrEqual(controls.x);
      expect(controls.x + controls.width).toBeLessThanOrEqual(header.x + header.width);
      expect(search.x).toBeGreaterThanOrEqual(header.x);
    };

    await expectHeaderNotToOverlap();

    await page.setViewportSize({ width: 1120, height: 800 });
    await expect(page.locator('.save-btn-label')).toBeHidden();
    await expect(page.locator('.global-search kbd')).toBeHidden();
    await expectHeaderNotToOverlap();
  });

  test('full click-through flow: environment, collection, requests, send, history, runner, report', async ({ page }) => {
    if (docsScreenshotDir) {
      await mkdir(docsScreenshotDir, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await installRelayBridge(page);
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible();
    await expect(page.locator('.brand-name')).toHaveText('Relay');
    await tourPause(page, 'App loaded');

    if (docsScreenshotDir) {
      try {
        await page.getByRole('button', { name: 'Cookies', exact: true }).click();
        await captureDocsScreenshot(page, 'cookie-jar-empty');
        await page.getByLabel('Close cookie jar').click();
      } catch (err) { console.log('docs screenshot cookie-jar-empty skipped:', err); }
    }

    await page.getByRole('button', { name: 'Environments' }).click();
    await page.getByLabel('New environment').click();
    await fillPrompt(page, 'New environment', 'Local Smoke');

    const envRows = page.getByTestId('environment-variable-row');
    await envRows.nth(0).getByLabel('Environment variable key').fill('baseUrl');
    await envRows.nth(0).getByLabel('Environment variable value').fill('https://api.relay.test');
    await expect(envRows).toHaveCount(2);
    await envRows.nth(1).getByLabel('Environment variable key').fill('token');
    await envRows.nth(1).getByRole('button', { name: 'Default' }).click();
    await envRows.nth(1).getByLabel('Environment variable value').fill('secret-e2e-token');
    await page.getByRole('button', { name: /^(Use environment|In use)$/ }).click();
    await expect(page.getByRole('button', { name: 'In use' })).toBeVisible();
    await tourPause(page, 'Environment created and activated');
    await waitForTransientToasts(page);
    await captureDocsScreenshot(page, 'environments-panel');

    await page.getByRole('button', { name: 'Collections' }).click();
    await page.locator('.collections-head-actions').getByLabel('Import collection').click();
    const importDialog = page.getByRole('dialog', { name: 'Import collection' });
    await expect(importDialog).toBeVisible();
    for (const source of ['Bruno / OpenCollection', 'Postman Collection', 'Insomnia Export', 'OpenAPI / Swagger', 'HAR from DevTools']) {
      await expect(importDialog).toContainText(source);
    }
    await captureDocsScreenshot(page, 'import-postman');
    await importDialog.getByRole('button', { name: 'Discard' }).click();

    await page.getByLabel('New collection').click();
    await fillPrompt(page, 'New collection', 'Smoke API');
    await expect(collectionRow(page, 'Smoke API')).toBeVisible();

    await collectionRow(page, 'Smoke API').getByLabel('Collection menu').click();
    await collectionRow(page, 'Smoke API').locator('.collection-menu').getByRole('button', { name: 'Add folder' }).click();
    await fillPrompt(page, 'New folder', 'Auth');
    await expect(folderRow(page, 'Auth')).toBeVisible();
    await tourPause(page, 'Collection and folder created');

    await folderRow(page, 'Auth').getByLabel('Folder menu').click();
    await folderRow(page, 'Auth').locator('.folder-menu').getByRole('button', { name: 'Add request' }).click();
    if (docsScreenshotDir) {
      try { await captureDocsScreenshot(page, 'new-request-dialog'); } catch (err) { console.log('docs screenshot new-request-dialog skipped:', err); }
    }
    await chooseRequestType(page, 'HTTP Request');
    await expect(page.getByLabel('Request name')).toBeVisible();

    await page.getByLabel('Request name').fill('Login user');
    await page.getByLabel('Request name').press('Enter');
    await page.getByLabel('HTTP method').click();
    await page.getByRole('option', { name: 'POST' }).click();
    await page.getByLabel('Request URL').fill('{{baseUrl}}/login');

    await chooseRequestSection(page, 'Params');
    await page.getByTestId('params-row').first().locator('input[placeholder="Key"]').fill('scope');
    await page.getByTestId('params-row').first().locator('input[placeholder="Value"]').fill('smoke');

    await chooseRequestSection(page, 'Authorization');
    await page.getByLabel('Auth Type').click();
    await page.getByRole('button', { name: 'Bearer Token' }).click();
    await page.locator('#bearer-token').fill('{{token}}');
    await captureDocsScreenshot(page, 'auth-bearer');
    if (docsScreenshotDir) {
      try {
        await page.getByLabel('Auth Type').click();
        await page.getByRole('button', { name: 'OAuth 2.0' }).click();
        await page.locator('#oauth2-url').fill('https://auth.relay.test/oauth/token');
        await page.locator('#oauth2-id').fill('relay-docs-client');
        await page.locator('#oauth2-secret').fill('<redacted>');
        await page.locator('#oauth2-scope').fill('openid profile');
        await captureDocsScreenshot(page, 'auth-oauth2-token-fetch');
        await page.getByLabel('Auth Type').click();
        await page.getByRole('button', { name: 'Bearer Token' }).click();
        await page.locator('#bearer-token').fill('{{token}}');
      } catch (err) { console.log('docs screenshot auth-oauth2-token-fetch skipped:', err); }
    }

    await chooseRequestSection(page, 'Headers');
    await page.getByTestId('request-header-row').first().locator('input[placeholder="Key"]').fill('X-Trace');
    await page.getByTestId('request-header-row').first().locator('input[placeholder="Value"]').fill('relay-e2e');
    await captureDocsScreenshot(page, 'headers-tab');

    await chooseRequestSection(page, 'Body');
    await page.locator('label.body-mode-label').filter({ hasText: 'raw' }).click();
    const requestPassword = docsScreenshotDir ? '<redacted>' : 'visible-test';
    await fillCodeEditor(
      page,
      'request-body-editor',
      JSON.stringify({ username: 'codex', password: requestPassword }, null, 2),
    );
    const requestBodyEditor = page.getByTestId('request-body-editor').locator('.cm-content');
    await requestBodyEditor.click();
    await page.keyboard.type('x');
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(requestBodyEditor).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(page.getByRole('dialog', { name: 'Delete request' })).toHaveCount(0);
    await expect(requestBodyEditor).not.toContainText(/x$/);

    await chooseRequestSection(page, 'Scripts');
    await fillCodeEditor(page, 'pre-request-script-editor', 'pm.variables.set("requestId", "e2e-login")');
    await captureDocsScreenshot(page, 'scripting-pre-request');
    await page.locator('.script-section').getByRole('tab', { name: /^Tests/ }).click();
    await fillCodeEditor(page, 'test-script-editor', 'pm.test("status is 200", () => pm.expect(pm.response.code).to.eql(200))');
    await tourPause(page, 'HTTP request configured');

    const panelDivider = page.getByLabel('Resize panels');
    for (let i = 0; i < 24; i += 1) await panelDivider.press('ArrowDown');
    await chooseRequestSection(page, 'Settings');
    const browserEmulationSetting = page.locator('label.postman-setting').filter({ hasText: 'Browser request emulation' });
    await browserEmulationSetting.locator('.switch-control').click();
    await page.getByPlaceholder('http://localhost:5173').fill('https://app.relay.test');
    const corsSetting = page.locator('label.postman-setting').filter({ hasText: 'Enforce CORS' });
    await corsSetting.locator('.switch-control').click();
    const cspSetting = page.locator('label.postman-setting').filter({ hasText: 'Enforce CSP connect-src' });
    await cspSetting.locator('.switch-control').click();
    await page.locator('label.postman-setting-tall textarea').fill("default-src 'self'; connect-src https://api.relay.test");
    await cspSetting.scrollIntoViewIfNeeded();
    await captureDocsScreenshot(page, 'request-settings');
    await captureDocsScreenshot(page, 'browser-security');
    await page.locator('.settings-actions').getByRole('button', { name: 'Reset' }).click();
    for (let i = 0; i < 24; i += 1) await panelDivider.press('ArrowUp');

    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('200 OK')).toBeVisible();
    await expectResponseTabsToFit(page);
    await expect(page.locator('.test-results-panel')).toContainText('status is 200');
    await expect(page.locator('.test-results-panel')).toContainText('test script accepted');
    await expectScriptResultsPanelLayout(page);
    await captureDocsScreenshot(page, 'response-viewer-tests');
    await page.locator('.response-mini-tabs').getByRole('tab', { name: 'Body' }).click();
    await captureDocsScreenshot(page, 'response-viewer-json');
    await captureDocsScreenshot(page, 'request-editor');
    if (docsScreenshotDir) {
      try {
        await page.getByRole('button', { name: 'Search response', exact: true }).click();
        await page.getByLabel('Search response body').fill('login-e2e');
        await expect(page.locator('.response-search-count')).toHaveText('1/1');
        await captureDocsScreenshot(page, 'response-viewer-search');
        await page.getByRole('button', { name: 'Search response', exact: true }).click();
      } catch (err) { console.log('docs screenshot response-viewer-search skipped:', err); }
    }
    if (docsScreenshotDir) {
      try {
        await page.getByLabel('Settings', { exact: true }).click();
        await page.getByRole('tab', { name: 'General', exact: true }).click({ timeout: 4000 });
        await page.locator('summary').filter({ hasText: 'Scripts' }).click();
        await page.getByRole('button', { name: /Tengo/ }).click();
        await page.getByLabel('Close settings').click();
        await chooseRequestSection(page, 'Scripts');
        await page.locator('.script-section').getByRole('tab', { name: /^Pre-request/ }).click();
        await fillCodeEditor(page, 'pre-request-script-editor', [
          'pm.variables.set("requestId", "tengo-docs")',
          'pm.log("Tengo pre-request ready")',
        ].join('\n'));
        await captureDocsScreenshot(page, 'scripting-tengo');
        await page.getByLabel('Settings', { exact: true }).click();
        await page.getByRole('tab', { name: 'General', exact: true }).click({ timeout: 4000 });
        await page.locator('summary').filter({ hasText: 'Scripts' }).click();
        await page.getByRole('button', { name: /JavaScript/ }).click();
        await page.getByLabel('Close settings').click();
        await page.locator('.script-section').getByRole('tab', { name: /^Tests/ }).click();
      } catch (err) { console.log('docs screenshot scripting-tengo skipped:', err); }
    }
    if (docsScreenshotDir) {
      try {
        await page.locator('.response-status-bar').screenshot({ path: join(docsScreenshotDir, 'status-bar.png'), animations: 'disabled' });
      } catch (err) { console.log('docs screenshot status-bar skipped:', err); }
      try {
        await page.getByLabel('Code snippet', { exact: true }).click();
        await expect(page.locator('.curl-preview')).not.toContainText('Loading snippet', { timeout: 4000 });
        await captureDocsScreenshot(page, 'code-snippets');
        await page.getByLabel('Code snippet', { exact: true }).click();
      } catch (err) { console.log('docs screenshot code-snippets skipped:', err); }
    }
    await maybeCaptureResponseScreenshot(page);
    const responseBodyViewer = page.getByRole('textbox', { name: 'Response body', exact: true });
    await responseBodyViewer.click();
    await expect(responseBodyViewer).toBeFocused();
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
    await expect.poll(() => responseBodyViewer.evaluate((viewer) => {
      const selection = window.getSelection();
      return Boolean(
        selection?.toString().includes('"requestId": "login-e2e"')
        && selection.anchorNode
        && selection.focusNode
        && viewer.contains(selection.anchorNode)
        && viewer.contains(selection.focusNode)
      );
    })).toBe(true);
    await page.getByLabel('Save to file').click();
    await expect.poll(() => page.evaluate(() => window.__relayE2E.savedFiles.length)).toBe(1);

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.locator('.history-entry').first()).toContainText('POST');
    await expect(page.locator('.history-entry').first()).toContainText('/login?scope=smoke');
    await expect(page.locator('.history-entry').first()).toContainText('200');
    await tourPause(page, 'HTTP response saved and history checked');
    await captureDocsScreenshot(page, 'history');
    if (docsScreenshotDir) {
      try {
        await page.getByRole('button', { name: 'Cookies', exact: true }).click();
        await page.getByPlaceholder('Type a domain name').fill('api.relay.test');
        await page.getByRole('button', { name: 'Add domain' }).click();
        await page.getByLabel('Raw cookie').fill('session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax');
        await page.locator('.cookie-raw-actions').getByRole('button', { name: 'Save' }).click();
        await expect(page.locator('.cookie-domain-card')).toContainText('session');
        await captureDocsScreenshot(page, 'cookie-jar-populated');
        await page.getByLabel('Close cookie jar').click();
      } catch (err) {
        console.log('docs screenshot cookie-jar-populated skipped:', err);
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    await page.getByRole('button', { name: 'Collections' }).click();
    await folderRow(page, 'Auth').getByLabel('Folder menu').click();
    await folderRow(page, 'Auth').locator('.folder-menu').getByRole('button', { name: 'Add request' }).click();
    await chooseRequestType(page, 'GraphQL Request');
    await page.getByLabel('Request name').fill('Current user GraphQL');
    await page.getByLabel('Request name').press('Enter');
    await page.getByLabel('Request URL').fill('{{baseUrl}}/graphql');
    await fillCodeEditor(page, 'graphql-query-editor', 'query CurrentUser { me { id name } }');
    await page.getByRole('button', { name: 'Query', exact: true }).click();
    await expect(page.getByText('200 OK')).toBeVisible();
    await expectResponseTabsToFit(page);
    await page.locator('.response-mini-tabs').getByRole('tab', { name: 'Body' }).click();
    await expect(page.locator('.response-body-viewer')).toContainText('Relay Tester');
    await captureDocsScreenshot(page, 'request-graphql');
    await tourPause(page, 'GraphQL request sent');

    await page.getByRole('button', { name: 'Collections' }).click();
    await folderRow(page, 'Auth').getByLabel('Folder menu').click();
    await folderRow(page, 'Auth').locator('.folder-menu').getByRole('button', { name: 'Run folder' }).click();
    await expect(page.getByRole('region', { name: 'Collection runner' })).toBeVisible();
    await expect(page.getByTestId('runner-request-row')).toHaveCount(2);
    await page.getByRole('button', { name: /Run 2 Requests/ }).click();
    await expect(page.getByTestId('runner-result-row')).toHaveCount(2);
    await expect(page.locator('.runner-results-summary')).toContainText('Passed');
    await expect(page.locator('.runner-results-summary')).toContainText('2/2 requests');
    await page.getByRole('button', { name: 'Download Report' }).click();
    await expect.poll(() => page.evaluate(() => window.__relayE2E.savedFiles.length)).toBe(2);
    await tourPause(page, 'Runner finished and report downloaded');
    await captureDocsScreenshot(page, 'collection-runner-results');

    await page.getByRole('button', { name: 'Collections' }).click();
    await folderRow(page, 'Auth').getByLabel('Folder menu').click();
    await folderRow(page, 'Auth').locator('.folder-menu').getByRole('button', { name: 'Add request' }).click();
    await chooseRequestType(page, 'HTTP Request');
    await page.getByLabel('Request name').fill('Live events SSE');
    await page.getByLabel('Request name').press('Enter');
    await page.getByLabel('HTTP method').click();
    await page.getByRole('option', { name: 'SSE' }).click();
    await page.getByLabel('Request URL').fill('{{baseUrl}}/events');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('.sse-panel')).toContainText('Connected');
    await expect(page.locator('.sse-event-list')).toContainText('Relay stream is live');
    await captureDocsScreenshot(page, 'request-sse');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Collections' }).click();
    await collectionRow(page, 'Smoke API').getByLabel('Collection menu').click();
    await collectionRow(page, 'Smoke API').locator('.collection-menu').getByRole('button', { name: 'Settings' }).click();
    await page.locator('.collection-settings-shell').getByRole('tab', { name: /^Headers/ }).click();
    const collectionHeaderRows = page.locator('.collection-kv-table .kv-row');
    await collectionHeaderRows.nth(0).locator('input[placeholder="Header"]').fill('X-Client');
    await collectionHeaderRows.nth(0).locator('input[placeholder="Value"]').fill('relay-docs');
    await collectionHeaderRows.nth(1).locator('input[placeholder="Header"]').fill('Accept');
    await collectionHeaderRows.nth(1).locator('input[placeholder="Value"]').fill('application/json');
    await page.getByRole('heading', { name: 'Smoke API', exact: true }).click();
    await captureDocsScreenshot(page, 'collection-defaults');

    await addRequestFromFolder(page, 'Auth', 'gRPC Request');
    await page.getByLabel('Request name').fill('Inventory gRPC');
    await page.getByLabel('Request name').press('Enter');
    await page.getByLabel('gRPC target').fill('grpc.relay.test:443');
    await page.getByLabel('gRPC method').click();
    await expect(page.getByRole('option', { name: /Inventory \/ GetItem/ })).toBeVisible();
    await page.getByRole('option', { name: /Inventory \/ GetItem/ }).click();
    await fillCodeEditor(page, 'grpc-message-editor', JSON.stringify({ sku: 'sku-42' }, null, 2));
    await chooseRequestSection(page, 'Metadata');
    await page.locator('.kv-row').first().locator('input[placeholder="Metadata key"]').fill('x-client');
    await page.locator('.kv-row').first().locator('input[placeholder="Value"]').fill('playwright');
    await page.getByRole('button', { name: 'Invoke', exact: true }).click();
    await expect(page.locator('.response-status-bar')).toContainText('OK');
    await expect(page.locator('.grpc-message-list')).toContainText('sku-42');
    await expect(page.locator('.grpc-message-list')).toContainText('stock');
    await captureDocsScreenshot(page, 'request-grpc');
    await tourPause(page, 'gRPC discovery and invoke checked');

    await addRequestFromFolder(page, 'Auth', 'WebSocket Request');
    await page.getByLabel('Request name').fill('Chat WebSocket');
    await page.getByLabel('Request name').press('Enter');
    await page.getByLabel('Request URL').fill('wss://ws.relay.test/socket');
    await fillCodeEditor(page, 'websocket-message-editor', JSON.stringify({ hello: 'socket' }, null, 2));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('.ws-panel')).toContainText('Connected');
    await expect(page.locator('.ws-message-list')).toContainText('Connected to wss://ws.relay.test/socket');
    await page.locator('.ws-message-actions .ws-message-send').click();
    await expect(page.locator('.ws-message-list')).toContainText('hello');
    await expect(page.locator('.ws-message-list')).toContainText('echo');
    await captureDocsScreenshot(page, 'request-websocket');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await tourPause(page, 'WebSocket connect, send, echo, disconnect checked');

    await addRequestFromFolder(page, 'Auth', 'Socket.IO Request');
    await page.getByLabel('Request name').fill('Socket.IO chat');
    await page.getByLabel('Request name').press('Enter');
    await page.getByLabel('Request URL').fill('https://io.relay.test');
    await page.locator('.sio-event-name-input').fill('chat:message');
    await page.locator('.sio-ack-check').check();
    await fillCodeEditor(page, 'socketio-message-editor', JSON.stringify({ text: 'hello sio' }, null, 2));
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('.sio-panel')).toContainText('Connected');
    await page.locator('.sio-editor-toolbar .ws-message-send').click();
    await expect(page.locator('.sio-panel .ws-message-list')).toContainText('chat:message');
    await expect(page.locator('.sio-panel .ws-message-list')).toContainText('ack for "chat:message"');
    await captureDocsScreenshot(page, 'request-socketio');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await tourPause(page, 'Socket.IO connect, emit, ack, disconnect checked');

    if (docsScreenshotDir) {
      await page.getByRole('button', { name: 'Collections' }).click();
      try { await page.locator('aside.sidebar').screenshot({ path: join(docsScreenshotDir, 'sidebar-collections.png'), animations: 'disabled' }); } catch (err) { console.log('docs screenshot sidebar-collections skipped:', err); }
      try {
        await page.getByLabel('Workspace switcher').click({ timeout: 4000 });
        await captureDocsScreenshot(page, 'workspace-switcher');
        await page.keyboard.press('Escape');
      } catch (err) { console.log('docs screenshot workspace-switcher skipped:', err); }
      try {
        await page.getByLabel('Workspace switcher').click({ timeout: 4000 });
        await page.getByRole('button', { name: 'View all workspaces' }).click({ timeout: 4000 });
        await captureDocsScreenshot(page, 'workspace-overview');
        await page.getByRole('button', { name: 'Open Git sync' }).click({ timeout: 4000 });
        await expect(page.locator('.git-workspace')).toContainText('feature/docs-refresh');
        await page.locator('.git-file-open').first().click();
        await expect(page.locator('.git-diff')).toContainText('oauth2RefreshToken');
        await captureDocsScreenshot(page, 'git-workspace');
      } catch (err) { console.log('docs screenshot workspace-overview skipped:', err); }
      try {
        await page.locator('.global-search').click({ timeout: 4000 });
        await expect(page.getByRole('dialog', { name: 'Search requests' })).toBeVisible({ timeout: 4000 });
        await captureDocsScreenshot(page, 'global-search');
        await page.keyboard.press('Escape');
      } catch (err) { console.log('docs screenshot global-search skipped:', err); }
      await page.keyboard.press('Escape');
    }

    await page.getByLabel('Settings', { exact: true }).click();
    if (docsScreenshotDir) {
      try {
        await page.getByRole('tab', { name: 'General', exact: true }).click({ timeout: 4000 });
        await captureDocsScreenshot(page, 'settings-general');
        await page.getByLabel('Search settings').fill('autosave');
        await captureDocsScreenshot(page, 'settings-search-filter');
        await page.getByLabel('Search settings').fill('');
      } catch (err) { console.log('docs screenshot settings-general/search skipped:', err); }
      try { await page.getByRole('tab', { name: 'Theme', exact: true }).click({ timeout: 4000 }); await captureDocsScreenshot(page, 'settings-theme'); } catch (err) { console.log('docs screenshot settings-theme skipped:', err); }
      try { await page.getByRole('tab', { name: 'Shortcuts', exact: true }).click({ timeout: 4000 }); await captureDocsScreenshot(page, 'settings-shortcuts'); } catch (err) { console.log('docs screenshot settings-shortcuts skipped:', err); }
      try { await page.getByRole('tab', { name: 'Updates', exact: true }).click({ timeout: 4000 }); await captureDocsScreenshot(page, 'settings-updates-dev'); } catch (err) { console.log('docs screenshot settings-updates-dev skipped:', err); }
      try { await page.getByRole('tab', { name: 'About', exact: true }).click({ timeout: 4000 }); await captureDocsScreenshot(page, 'settings-about'); } catch (err) { console.log('docs screenshot settings-about skipped:', err); }
    }
    await page.getByRole('tab', { name: 'Proxy', exact: true }).click();
    await page.getByRole('radio', { name: 'On', exact: true }).check();
    await page.locator('#proxy-hostname').fill('proxy.corp.example');
    await page.locator('#proxy-port').fill('8080');
    await page.locator('#proxy-bypass').fill('localhost, 127.0.0.1, .internal');
    await captureDocsScreenshot(page, 'settings-proxy');

    await page.getByRole('tab', { name: 'General', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Advanced data' }).click();
    await page.getByRole('button', { name: 'Export all data', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Export all data' })).toBeVisible();
    await captureDocsScreenshot(page, 'backup-export-warning');
    await page.getByRole('dialog', { name: 'Export all data' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByLabel('Close settings').click();

    const state = await page.evaluate(() => window.__relayE2E);
    expect(state.sentRequests).toHaveLength(4);
    expect(state.sentRequests.some(req => String(req.url).includes('https://api.relay.test/login'))).toBe(true);
    expect(state.sentRequests.some(req => String(req.url).includes('https://api.relay.test/graphql'))).toBe(true);
    expect(state.sentRequests.some(req => String(req.body).includes(requestPassword))).toBe(true);
    expect(state.sseConnects).toHaveLength(1);
    expect(state.grpcDiscoveries.some(req => String(req.target).includes('grpc.relay.test:443'))).toBe(true);
    expect(state.sentGrpcRequests.some(req => String(req.fullMethod).includes('shop.Inventory/GetItem'))).toBe(true);
    expect(state.webSocketConnects).toHaveLength(1);
    expect(state.webSocketMessages.some(entry => String(entry.message?.data).includes('hello'))).toBe(true);
    expect(state.socketIOConnects).toHaveLength(1);
    expect(state.socketIOEmits.some(entry => entry.message?.eventName === 'chat:message')).toBe(true);
    expect(state.savedStores.length).toBeGreaterThan(4);
    expect(state.savedFiles.some(file => file.content.includes('Relay collection runner report'))).toBe(true);
  });

  test('renders an ordinary JSON response without virtualization', async ({ page }) => {
    const ordinaryResponsePath = process.env.RELAY_E2E_ORDINARY_RESPONSE_PATH;
    const responseBody = ordinaryResponsePath
      ? await readFile(ordinaryResponsePath, 'utf8')
      : JSON.stringify({
        resources: Array.from({ length: 60 }, (_, index) => ({
          id: `resource-${index}`,
          title: `exampleEditForAutotest-${index}`,
          path: `widget-kind/resource-${index}.json`,
        })),
      }, null, 2);
    const formattedResponseBody = JSON.stringify(JSON.parse(responseBody), null, 2);
    expect(formattedResponseBody.split('\n').length).toBeGreaterThan(250);

    await installRelayBridge(page, responseBody);
    await page.goto('/');
    await page.getByLabel('New unsaved request').click();
    await chooseRequestType(page, 'HTTP Request');
    await page.getByLabel('Request URL').fill('https://api.relay.test/large-response');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('200 OK')).toBeVisible();

    const viewer = page.getByRole('textbox', { name: 'Response body', exact: true });
    await expect(viewer).not.toHaveAttribute('data-virtualized', 'true');
    await expect(viewer.locator('.response-line')).toHaveCount(formattedResponseBody.split('\n').length);
    await viewer.evaluate((element) => {
      for (const top of [400, 1_200, 2_400, 4_000, 1_600]) {
        element.scrollTop = top;
        element.dispatchEvent(new Event('scroll'));
      }
    });
    await expect(viewer.locator('.response-line-no')).toHaveCount(formattedResponseBody.split('\n').length);
  });

  test('virtualizes a large JSON response while scrolling', async ({ page }) => {
    const realResponsePath = process.env.RELAY_E2E_REAL_RESPONSE_PATH;
    const realResponseBody = realResponsePath ? await readFile(realResponsePath, 'utf8') : '';
    await installRelayBridge(page, realResponseBody);
    await page.goto('/');

    await page.getByLabel('New unsaved request').click();
    await chooseRequestType(page, 'HTTP Request');
    await expect(page.getByLabel('Request URL')).toBeVisible();
    await page.getByLabel('Request URL').fill('https://api.relay.test/large-response');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('200 OK')).toBeVisible();

    const viewer = page.getByRole('textbox', { name: 'Response body', exact: true });
    await expect(viewer).toHaveAttribute('data-virtualized', 'true');
    const renderedLines = viewer.locator('.response-line');
    await expect(renderedLines).not.toHaveCount(0);
    expect(await renderedLines.count()).toBeLessThan(200);
    expect(await renderedLines.first().locator('.response-line-no').evaluate(
      element => getComputedStyle(element).position,
    )).toBe('relative');
    await captureDocsScreenshot(page, 'response-viewer-large-body');

    await viewer.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => Number(
      await renderedLines.first().getAttribute('data-line-number'),
    )).toBeGreaterThan(1_000);
    expect(await renderedLines.count()).toBeLessThan(200);
    const firstRenderedLine = renderedLines.first();
    const gutterLeft = await firstRenderedLine.locator('.response-line-no').evaluate(
      element => Math.round(element.getBoundingClientRect().left),
    );
    await viewer.evaluate((element) => {
      element.scrollLeft = 240;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => firstRenderedLine.locator('.response-line-no').evaluate(
      element => Math.round(element.getBoundingClientRect().left),
    )).toBe(gutterLeft);

    await page.getByLabel('Search response').click();
    const realCategoryName = realResponseBody
      ? (JSON.parse(realResponseBody) as { Categories?: Array<{ Name?: unknown }> }).Categories?.[0]?.Name
      : undefined;
    const uniqueQuery = realResponseBody ? JSON.stringify(realCategoryName) : 'Product 10-3"';
    await page.getByLabel('Search response body').fill(uniqueQuery);
    await expect(page.locator('.response-search-count')).toHaveText('1/1');
    await expect(viewer.locator('.rsp-search-current')).toContainText(uniqueQuery);
    await expect.poll(async () => Number(
      await renderedLines.first().getAttribute('data-line-number'),
    )).toBeLessThan(1_000);
    expect(await renderedLines.count()).toBeLessThan(200);
  });

  test('keeps wrapped response lines inside the viewer gutter', async ({ page }) => {
    const nestedPackage = JSON.stringify({
      name: '@relay/factory',
      title: 'Release validation package for a frontend factory workspace',
      scripts: {
        'lint:fix': './node_modules/.bin/lint-fix',
        validate: './node_modules/.bin/configurator validate',
      },
      version: '16.7.0-rc.16',
      description: 'Contains schema definitions for frontend release validation',
      dependencies: {
        '@relay/factory': '>=16.7.0-rc.0 <17.0.0',
        '@relay-uiremote/chat': '~16.5.0',
        '@relay-uiremote/calendar': '~16.6.1',
      },
    }, null, 2);
    const responseBody = JSON.stringify({ content: nestedPackage }, null, 2);
    await installRelayBridge(page, responseBody);
    await page.goto('/');

    await page.getByLabel('New unsaved request').click();
    await chooseRequestType(page, 'HTTP Request');
    await page.getByLabel('Request URL').fill('https://api.relay.test/large-response');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('200 OK')).toBeVisible();

    const viewer = page.getByRole('textbox', { name: 'Response body', exact: true });
    await expect(viewer).not.toHaveAttribute('data-virtualized', 'true');
    const wrappedLine = viewer.locator('.response-line[data-line-number="2"]');
    await expect(wrappedLine).toBeVisible();
    await wrappedLine.hover();

    const metrics = await wrappedLine.evaluate((line) => {
      const viewerNode = line.closest('.response-body-viewer') as HTMLElement;
      const gutterNode = line.querySelector('.response-line-no') as HTMLElement;
      const lineRect = line.getBoundingClientRect();
      const gutterRect = gutterNode.getBoundingClientRect();
      return {
        clientWidth: viewerNode.clientWidth,
        gutterHeight: gutterRect.height,
        lineHeight: lineRect.height,
        scrollWidth: viewerNode.scrollWidth,
      };
    });

    expect(metrics.lineHeight).toBeGreaterThan(40);
    expect(Math.abs(metrics.gutterHeight - metrics.lineHeight)).toBeLessThan(1);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  });
});
