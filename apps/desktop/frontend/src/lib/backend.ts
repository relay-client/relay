export type UpdateInfo = {
  version: string;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
  assetName: string;
  sha256: string;
};

export type UpdateCheckResult = {
  info: UpdateInfo | null;
  error: string;
};

export type AppInfo = {
  name: string;
  version: string;
  runtime: string;
  goVersion: string;
};

export type SaveRequestStoreResult = {
  ok: boolean;
  error: string;
};

export type GitFileStatus = {
  path: string;
  index: string;
  worktree: string;
  status: string;
};

export type GitStashEntry = {
  ref: string;
  index: number;
  message: string;
};

export type GitWorkspaceStatus = {
  isRepo: boolean;
  workspaceRoot: string;
  root: string;
  missingRoot: boolean;
  branch: string;
  head: string;
  upstream: string;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  pushCommitCount: number;
  pushRemote: string;
  operation: string;
  clean: boolean;
  files: GitFileStatus[];
  remotes: string[];
  stashes: GitStashEntry[];
  error: string;
  authRequired?: boolean;
  authScheme?: string;
  authHost?: string;
  tokenRejected?: boolean;
};

export type GitTokenInfoResult = { host: string; hasToken: boolean; username: string };
export type GitAuthConfigResult = { method: string; sshKeyPath: string };

export type GitDiffResult = {
  path: string;
  diff: string;
  stagedDiff: string;
  unstagedDiff: string;
  binary: boolean;
  truncated: boolean;
  error: string;
};

export type GitOperationResult = {
  ok: boolean;
  git: GitWorkspaceStatus;
  error: string;
  output: string;
  files: string[];
  pullSummary?: GitPullSummary;
  commitCount?: number;
};

export type GitPullSummary = {
  changed: number;
  added: number;
  updated: number;
  deleted: number;
  renamed: number;
};

export type GitConflictFileResult = {
  ok: boolean;
  git: GitWorkspaceStatus;
  path: string;
  content: string;
  oursContent: string;
  theirsContent: string;
  oursAvailable: boolean;
  theirsAvailable: boolean;
  binary: boolean;
  truncated: boolean;
  oursTruncated: boolean;
  theirsTruncated: boolean;
  error: string;
  output: string;
};

export type GitCommitEntry = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
};

export type GitLogResult = {
  ok: boolean;
  git: GitWorkspaceStatus;
  commits: GitCommitEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
  error: string;
  output: string;
};

export type GitBranchEntry = {
  name: string;
  fullName: string;
  remote: string;
  current: boolean;
  upstream: string;
};

export type GitBranchListResult = {
  ok: boolean;
  git: GitWorkspaceStatus;
  current: string;
  localBranches: GitBranchEntry[];
  remoteBranches: GitBranchEntry[];
  error: string;
  output: string;
};

export type CollectionTextFile = {
  path: string;
  content: string;
};

export type CollectionTextFilesResult = {
  root: string;
  name: string;
  files: CollectionTextFile[];
  error: string;
};

export type WorkspaceSecretRef = {
  key: string;
  label: string;
  scope: string;
};

export type WorkspaceDiagnostic = {
  scope: 'workspace' | 'collection' | 'request' | 'environment';
  severity: 'error';
  path: string;
  message: string;
  workspaceId?: string;
  collectionId?: string;
  requestId?: string;
  line?: number;
  column?: number;
  blocking?: boolean;
};

export type WorkspaceOpenResult = {
  ok: boolean;
  root: string;
  payload: string;
  git: GitWorkspaceStatus;
  missingSecrets: WorkspaceSecretRef[];
  diagnostics?: WorkspaceDiagnostic[];
  error: string;
  output: string;
  pullSummary?: GitPullSummary;
  targetExists?: boolean;
};

export type DefaultWorkspaceLocationResult = {
  path: string;
  error: string;
};

export type WorkspaceYAMLFileResult = {
  ok: boolean;
  path: string;
  content: string;
  error: string;
};

export type KeyValue = {
  key: string;
  value: string;
  enabled: boolean;
  isFile: boolean;
  fileName: string;
};

export type AuthConfig = {
  type: string;
  token: string;
  username: string;
  password: string;
  keyName: string;
  keyValue: string;
  keyIn: string;
  oauth2GrantType?: string;
  oauth2TokenURL: string;
  oauth2AuthURL?: string;
  oauth2RedirectURL?: string;
  oauth2ClientID: string;
  oauth2Secret: string;
  oauth2Scope: string;
  oauth2UsePKCE?: boolean;
  oauth2RefreshToken?: string;
  oauth2InsecureSkipVerify?: boolean;
  awsAccessKey: string;
  awsSecretKey: string;
  awsRegion: string;
  awsService: string;
};

export type OAuth2TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type CookieJarEntry = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt: number;
  session: boolean;
  secure: boolean;
  httpOnly: boolean;
  sameSite: '' | 'lax' | 'strict' | 'none';
  hostOnly: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CookieJarResult = {
  cookies: CookieJarEntry[];
  error?: string;
};

export type TestResult = {
  name: string;
  passed: boolean;
  error?: string;
};

export type ScriptResult = {
  tests: TestResult[];
  logs?: string[];
  error?: string;
};

export type ResponseTimings = {
  total: number;
  prepare: number;
  socketInitialization: number;
  dnsLookup: number;
  tcpHandshake: number;
  tlsHandshake: number;
  waitingTTFB: number;
  download: number;
  process: number;
};

export type HttpRequest = {
  requestId?: string;
  // Workspace ID — backend uses this to pick the per-workspace cookie jar
  // so cookies set by request A in workspace "prod" don't leak into
  // request B issued from workspace "sandbox".
  workspaceId?: string;
  method: string;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  bodyType: string;
  body: string;
  bodyFilePath: string;
  formData: KeyValue[];
  preRequestScript: string;
  testScript: string;
  scriptEngine?: string;
  followRedirects: boolean;
  timeoutMs: number;
  httpVersion: string;
  enableSSLVerification: boolean;
  followOriginalMethod: boolean;
  followAuthorizationHeader: boolean;
  removeRefererHeader: boolean;
  encodeUrlAutomatically: boolean;
  disableCookieJar: boolean;
  maxRedirects: number;
  secretEnvironmentKeys?: string[];
  secretEnvironmentValues?: string[];
  collectionVariables?: Record<string, string>;
  proxyUrl?: string;
  proxyMode?: '' | 'off' | 'on' | 'system';
  proxyBypass?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  clientKeyPassword?: string;
  browserEmulation?: boolean;
  browserOrigin?: string;
  browserWithCredentials?: boolean;
  browserEnforceCORS?: boolean;
  browserEnforceCSP?: boolean;
  browserCSP?: string;
  wsHandshakeTimeoutMs?: number;
  wsReconnectAttempts?: number;
  wsReconnectIntervalMs?: number;
  wsMaxMessageSizeMb?: number;
  sioClientVersion?: string;
  sioPath?: string;
  sioNamespace?: string;
  sioListenEvents?: string[];
  sseDisableReconnect?: boolean;
  sseReconnectIntervalMs?: number;
};

export type SentRequest = {
  method: string;
  url: string;
  proto: string;
  headers: KeyValue[];
};

export type ConnectionInfo = {
  reused: boolean;
  wasIdle: boolean;
  localAddr?: string;
  remoteAddr?: string;
  protocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  alpn?: string;
  serverName?: string;
  addresses?: string[];
};

export type TimelineEvent = {
  label: string;
  atMs: number;
  detail?: string;
};

export type HttpResponse = {
  statusCode: number;
  status: string;
  headers: KeyValue[];
  body: string;
  duration: number;
  timings?: ResponseTimings;
  size: number;
  error?: string;
  preRequestResult: ScriptResult;
  testResult: ScriptResult;
  sentRequests?: SentRequest[];
  connection?: ConnectionInfo;
  timeline?: TimelineEvent[];
};

export type GrpcMethodInfo = {
  fullName: string;
  service: string;
  name: string;
  requestType: string;
  responseType: string;
  exampleMessage: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
};

export type GrpcServiceDefinition = {
  source: string;
  services: string[];
  methods: GrpcMethodInfo[];
  error?: string;
};

export type GrpcRequest = {
  requestId?: string;
  target: string;
  fullMethod: string;
  message: string;
  metadata: KeyValue[];
  auth: AuthConfig;
  useReflection: boolean;
  protoFilePath: string;
  protoImportPaths: string[];
  useTls: boolean;
  enableSSLVerification: boolean;
  serverName: string;
  includeDefaultValues: boolean;
  maxResponseMessageSizeMb: number;
  timeoutMs: number;
  preRequestScript: string;
  testScript: string;
  scriptEngine?: string;
  secretEnvironmentKeys?: string[];
  secretEnvironmentValues?: string[];
  collectionVariables?: Record<string, string>;
};

export type GrpcMessage = {
  index: number;
  direction?: 'incoming' | 'outgoing' | string;
  body: string;
  size: number;
  timestamp: number;
};

export type GrpcResponse = {
  grpcCode: string;
  grpcMessage: string;
  status: string;
  headers: KeyValue[];
  trailers: KeyValue[];
  messages: GrpcMessage[];
  body: string;
  duration: number;
  size: number;
  timestamp?: number;
  error?: string;
  method: GrpcMethodInfo;
  preRequestResult: ScriptResult;
  testResult: ScriptResult;
};

export type GrpcHeadersEvent = {
  requestId: string;
  headers: KeyValue[];
  method: GrpcMethodInfo;
  duration: number;
  timestamp: number;
};

export type GrpcMessageEvent = {
  requestId: string;
  message: GrpcMessage;
  size: number;
  duration: number;
  timestamp: number;
};

export type GrpcTrailersEvent = {
  requestId: string;
  grpcCode: string;
  grpcMessage: string;
  status: string;
  trailers: KeyValue[];
  error?: string;
  duration: number;
  timestamp: number;
};

export type GrpcDoneEvent = {
  requestId: string;
  response: GrpcResponse;
  timestamp: number;
};

export type WebSocketSendMessage = {
  type: 'text' | 'binary' | 'ping' | 'pong' | 'close';
  data: string;
  encoding?: 'plain' | 'base64' | '';
  code?: number;
};

export type WebSocketSendResult = {
  ok: boolean;
  error?: string;
};

export type SocketIOEmitMessage = {
  eventName: string;
  args: string[];
  namespace?: string;
  ack?: boolean;
};

export type SocketIOEmitResult = {
  ok: boolean;
  ackId?: number;
  error?: string;
};

export type RuntimeBridge = {
  EventsOn?: <T = unknown>(eventName: string, callback: (payload: T) => void) => () => void;
  BrowserOpenURL?: (url: string) => void;
  WindowMinimise?: () => void | Promise<void>;
  WindowToggleMaximise?: () => void | Promise<void>;
  WindowIsMaximised?: () => boolean | Promise<boolean>;
  WindowSetLightTheme?: () => void | Promise<void>;
  WindowSetDarkTheme?: () => void | Promise<void>;
  WindowSetBackgroundColour?: (r: number, g: number, b: number, a: number) => void | Promise<void>;
  Quit?: () => void | Promise<void>;
};

declare global {
  interface Window {
    runtime?: RuntimeBridge;
    go?: {
      api?: {
        App?: {
          AppInfo?: () => Promise<AppInfo>;
          SendRequest?: (req: HttpRequest) => Promise<HttpResponse>;
          SendRequestToFile?: (req: HttpRequest, defaultName: string) => Promise<DownloadResult>;
          SendGrpcRequest?: (req: GrpcRequest) => Promise<GrpcResponse>;
          GrpcDiscover?: (req: GrpcRequest) => Promise<GrpcServiceDefinition>;
          CancelRequest?: (requestId: string) => Promise<void>;
          GetEnvironment?: () => Promise<Record<string, string>>;
          ClipboardSet?: (text: string) => Promise<void>;
          OpenFileDialog?: (title: string) => Promise<string>;
          OpenDirectoryDialog?: (title: string) => Promise<string>;
          OpenDirectoryDialogWithDefault?: (title: string, defaultDirectory: string) => Promise<string>;
          ReadTextFile?: (path: string) => Promise<string>;
          SaveFileDialog?: (name: string, content: string) => Promise<string>;
          DefaultWorkspaceLocation?: () => Promise<DefaultWorkspaceLocationResult>;
          SetDefaultWorkspaceLocation?: (path: string) => Promise<DefaultWorkspaceLocationResult>;
          ReadCollectionTextFiles?: (root: string) => Promise<CollectionTextFilesResult>;
          WriteCollectionTextFiles?: (root: string, files: CollectionTextFile[]) => Promise<string>;
          LoadRequestStore?: () => Promise<string>;
          LoadWorkspaceDiagnostics?: () => Promise<WorkspaceDiagnostic[]>;
          ReadWorkspaceYAMLFile?: (path: string) => Promise<WorkspaceYAMLFileResult>;
          WriteWorkspaceYAMLFile?: (path: string, content: string) => Promise<WorkspaceOpenResult>;
          SaveRequestStore?: (payload: string) => Promise<boolean>;
          SaveRequestStoreWithError?: (payload: string) => Promise<SaveRequestStoreResult>;
          GitStatus?: () => Promise<GitWorkspaceStatus>;
          GitDiff?: (path: string) => Promise<GitDiffResult>;
          GitOutgoingChanges?: () => Promise<GitDiffResult>;
          GitCommitLog?: (limit: number) => Promise<GitLogResult>;
          GitCommitLogPage?: (limit: number, offset: number) => Promise<GitLogResult>;
          GitCommitDiff?: (commit: string) => Promise<GitDiffResult>;
          GitConflictFile?: (path: string) => Promise<GitConflictFileResult>;
          GitResolveConflictFile?: (path: string, resolution: string, content: string) => Promise<GitOperationResult>;
          GitContinueOperation?: (message: string) => Promise<WorkspaceOpenResult>;
          GitAbortOperation?: () => Promise<WorkspaceOpenResult>;
          GitStashWorkspace?: (message: string) => Promise<WorkspaceOpenResult>;
          GitStashPopWorkspace?: (ref: string) => Promise<WorkspaceOpenResult>;
          GitFetchWorkspace?: () => Promise<GitWorkspaceStatus>;
          GitPullWorkspace?: () => Promise<WorkspaceOpenResult>;
          GitPullWorkspaceWithStrategy?: (strategy: string) => Promise<WorkspaceOpenResult>;
          GitPullBranch?: (branchName: string) => Promise<GitOperationResult>;
          GitInitWorkspace?: () => Promise<GitOperationResult>;
          GitAddRemote?: (remoteName: string, remoteUrl: string) => Promise<GitOperationResult>;
          GitTestRemote?: (remoteNameOrUrl: string) => Promise<GitOperationResult>;
          GitTokenInfo?: (remoteOrHost: string) => Promise<GitTokenInfoResult>;
          GitStoreToken?: (remoteOrHost: string, username: string, token: string) => Promise<GitOperationResult>;
          GitClearToken?: (remoteOrHost: string) => Promise<GitOperationResult>;
          GitSetSshKey?: (workspaceRoot: string, keyPath: string) => Promise<GitOperationResult>;
          GitAuthConfig?: (workspaceRoot: string) => Promise<GitAuthConfigResult>;
          GitSshUrlFor?: (remoteUrl: string) => Promise<string>;
          GitRemoteUrl?: (remoteName: string) => Promise<string>;
          GitSetRemoteUrl?: (remoteName: string, remoteUrl: string) => Promise<GitOperationResult>;
          GitBranches?: () => Promise<GitBranchListResult>;
          GitCheckoutBranch?: (branchName: string) => Promise<WorkspaceOpenResult>;
          GitCreateBranch?: (branchName: string, startPoint: string) => Promise<WorkspaceOpenResult>;
          GitCreateTrackingBranch?: (branchName: string, startPoint: string) => Promise<WorkspaceOpenResult>;
          GitDeleteBranch?: (branchName: string, remote: boolean, force: boolean) => Promise<GitOperationResult>;
          GitRenameBranch?: (branchName: string, newName: string, remote: boolean) => Promise<GitOperationResult>;
          GitStageWorkspaceFiles?: () => Promise<GitOperationResult>;
          GitCommitWorkspace?: (message: string) => Promise<GitOperationResult>;
          GitCommitWorkspaceFiles?: (paths: string[], message: string) => Promise<GitOperationResult>;
          GitPushWorkspace?: (remoteName: string) => Promise<GitOperationResult>;
          GitForcePushWorkspace?: (remoteName: string) => Promise<GitOperationResult>;
          GitDiscardWorkspaceFile?: (path: string) => Promise<WorkspaceOpenResult>;
          GitDiscardWorkspaceFiles?: (paths: string[]) => Promise<WorkspaceOpenResult>;
          GitDiscardWorkspaceChanges?: () => Promise<WorkspaceOpenResult>;
          GitCloneWorkspace?: (remoteUrl: string, parentDir: string, directoryName: string) => Promise<WorkspaceOpenResult>;
          GitCloneWorkspaceWithMode?: (remoteUrl: string, parentDir: string, directoryName: string, initMode: string) => Promise<WorkspaceOpenResult>;
          GitCloneWorkspaceWithAuth?: (remoteUrl: string, parentDir: string, directoryName: string, initMode: string, sshKeyPath: string, overwrite: boolean) => Promise<WorkspaceOpenResult>;
          OpenWorkspaceRoot?: (path: string) => Promise<WorkspaceOpenResult>;
          UseLocalWorkspaceStore?: () => Promise<WorkspaceOpenResult>;
          CreateLocalWorkspaceRoot?: (parentDir: string, directoryName: string, initMode: string) => Promise<WorkspaceOpenResult>;
          SaveWorkspaceSecrets?: (values: Record<string, string>) => Promise<WorkspaceOpenResult>;
          ConfirmQuit?: () => Promise<void>;
          CancelQuit?: () => Promise<void>;
          SetAppThemeBackground?: (theme: 'dark' | 'light', background: string) => Promise<void>;
          FetchOAuth2Token?: (auth: AuthConfig) => Promise<OAuth2TokenResponse>;
          AuthorizeOAuth2?: (auth: AuthConfig) => Promise<OAuth2TokenResponse>;
          RefreshOAuth2Token?: (auth: AuthConfig) => Promise<OAuth2TokenResponse>;
          ListCookies?: (workspaceId: string) => Promise<CookieJarEntry[]>;
          UpsertCookie?: (workspaceId: string, cookie: CookieJarEntry) => Promise<CookieJarResult>;
          DeleteCookie?: (workspaceId: string, cookie: CookieJarEntry) => Promise<CookieJarResult>;
          ClearCookies?: (workspaceId: string) => Promise<CookieJarEntry[]>;
          SetEnvironment?: (values: Record<string, string>) => Promise<void>;
          CheckForUpdate?: () => Promise<UpdateCheckResult>;
          ApplyUpdate?: (info: UpdateInfo) => Promise<string>;
          RestartApp?: () => Promise<void>;
          SSEConnect?: (sessionId: string, req: HttpRequest) => Promise<void>;
          SSEDisconnect?: (sessionId: string) => Promise<void>;
          WebSocketConnect?: (sessionId: string, req: HttpRequest) => Promise<void>;
          WebSocketDisconnect?: (sessionId: string) => Promise<void>;
          WebSocketSend?: (sessionId: string, msg: WebSocketSendMessage) => Promise<WebSocketSendResult>;
          SocketIOConnect?: (sessionId: string, req: HttpRequest) => Promise<void>;
          SocketIODisconnect?: (sessionId: string) => Promise<void>;
          SocketIOEmit?: (sessionId: string, msg: SocketIOEmitMessage) => Promise<SocketIOEmitResult>;
        };
      };
    };
  }
}

export async function getAppInfo(): Promise<AppInfo> {
  const app = window.go?.api?.App;
  if (!app?.AppInfo) {
    return { name: 'Relay', version: 'dev', runtime: 'browser', goVersion: 'unavailable' };
  }
  return app.AppInfo();
}

export async function sendHttpRequest(req: HttpRequest): Promise<HttpResponse> {
  const app = window.go?.api?.App;
  if (!app?.SendRequest) {
    throw new Error('Wails bridge not available');
  }
  return app.SendRequest(req);
}

export type DownloadResult = { response: HttpResponse; savedPath: string };

// Send the request and let the backend write the raw response body to a user-chosen file.
// Binary-safe: the bytes are written in Go, never round-tripped through the JS string body.
export async function sendHttpRequestToFile(req: HttpRequest, defaultName: string): Promise<DownloadResult> {
  const app = window.go?.api?.App;
  if (!app?.SendRequestToFile) {
    throw new Error('Wails bridge not available');
  }
  return app.SendRequestToFile(req, defaultName);
}

export async function sendGrpcRequest(req: GrpcRequest): Promise<GrpcResponse> {
  const app = window.go?.api?.App;
  if (!app?.SendGrpcRequest) {
    throw new Error('Wails bridge not available');
  }
  return app.SendGrpcRequest(req);
}

export async function grpcDiscover(req: GrpcRequest): Promise<GrpcServiceDefinition> {
  const app = window.go?.api?.App;
  if (!app?.GrpcDiscover) {
    throw new Error('Wails bridge not available');
  }
  return app.GrpcDiscover(req);
}

export async function cancelHttpRequest(requestId: string): Promise<void> {
  await window.go?.api?.App?.CancelRequest?.(requestId);
}

export async function listCookies(workspaceId: string): Promise<CookieJarEntry[]> {
  const app = window.go?.api?.App;
  if (!app?.ListCookies) return [];
  return app.ListCookies(workspaceId);
}

export async function upsertCookie(workspaceId: string, cookie: CookieJarEntry): Promise<CookieJarResult> {
  const app = window.go?.api?.App;
  if (!app?.UpsertCookie) return { cookies: [], error: 'Wails bridge not available' };
  return app.UpsertCookie(workspaceId, cookie);
}

export async function deleteCookie(workspaceId: string, cookie: CookieJarEntry): Promise<CookieJarResult> {
  const app = window.go?.api?.App;
  if (!app?.DeleteCookie) return { cookies: [], error: 'Wails bridge not available' };
  return app.DeleteCookie(workspaceId, cookie);
}

export async function clearCookies(workspaceId: string): Promise<CookieJarEntry[]> {
  const app = window.go?.api?.App;
  if (!app?.ClearCookies) return [];
  return app.ClearCookies(workspaceId);
}

export async function getEnvironment(): Promise<Record<string, string>> {
  const app = window.go?.api?.App;
  if (!app?.GetEnvironment) return {};
  return app.GetEnvironment();
}

export async function setEnvironment(values: Record<string, string>): Promise<void> {
  const app = window.go?.api?.App;
  if (!app?.SetEnvironment) return;
  await app.SetEnvironment(values);
}

const REQUEST_STORE_FALLBACK_KEY = 'relay.request.store.v1';

export async function loadRequestStore(): Promise<string> {
  const app = window.go?.api?.App;
  if (!app?.LoadRequestStore) {
    return localStorage.getItem(REQUEST_STORE_FALLBACK_KEY) ?? '';
  }
  return app.LoadRequestStore();
}

export async function loadWorkspaceDiagnostics(): Promise<WorkspaceDiagnostic[]> {
  const app = window.go?.api?.App;
  if (!app?.LoadWorkspaceDiagnostics) return [];
  const diagnostics = await app.LoadWorkspaceDiagnostics();
  return Array.isArray(diagnostics) ? diagnostics : [];
}

export async function readWorkspaceYAMLFile(path: string): Promise<WorkspaceYAMLFileResult> {
  return (await window.go?.api?.App?.ReadWorkspaceYAMLFile?.(path)) ?? { ok: false, path, content: '', error: 'Wails bridge not available' };
}

export async function writeWorkspaceYAMLFile(path: string, content: string): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.WriteWorkspaceYAMLFile?.(path, content)) ?? {
    ok: false,
    root: '',
    payload: '',
    git: { ...EMPTY_GIT_STATUS },
    missingSecrets: [],
    diagnostics: [],
    error: 'Wails bridge not available',
    output: '',
  };
}

export async function saveRequestStore(payload: string): Promise<SaveRequestStoreResult> {
  const app = window.go?.api?.App;
  if (app?.SaveRequestStoreWithError) {
    const result = await app.SaveRequestStoreWithError(payload);
    return { ok: Boolean(result?.ok), error: result?.error ?? '' };
  }
  if (!app?.SaveRequestStore) {
    localStorage.setItem(REQUEST_STORE_FALLBACK_KEY, payload);
    return { ok: true, error: '' };
  }
  const ok = await app.SaveRequestStore(payload);
  return { ok, error: ok ? '' : 'request store save failed' };
}

export async function confirmQuit(): Promise<void> {
  await window.go?.api?.App?.ConfirmQuit?.();
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return (await window.go?.api?.App?.CheckForUpdate?.()) ?? { info: null, error: '' };
}

export async function applyUpdate(info: UpdateInfo): Promise<string> {
  return (await window.go?.api?.App?.ApplyUpdate?.(info)) ?? '';
}

export async function restartApp(): Promise<void> {
  await window.go?.api?.App?.RestartApp?.();
}

export async function cancelQuit(): Promise<void> {
  await window.go?.api?.App?.CancelQuit?.();
}

export async function clipboardSet(text: string): Promise<void> {
  await window.go?.api?.App?.ClipboardSet?.(text);
}

export async function openFileDialog(title: string): Promise<string> {
  return (await window.go?.api?.App?.OpenFileDialog?.(title)) ?? '';
}

export async function openDirectoryDialog(title: string, defaultDirectory = ''): Promise<string> {
  const app = window.go?.api?.App;
  if (defaultDirectory && app?.OpenDirectoryDialogWithDefault) {
    return (await app.OpenDirectoryDialogWithDefault(title, defaultDirectory)) ?? '';
  }
  return (await app?.OpenDirectoryDialog?.(title)) ?? '';
}

export async function readTextFile(path: string): Promise<string> {
  return (await window.go?.api?.App?.ReadTextFile?.(path)) ?? '';
}

export async function saveFileDialog(name: string, content: string): Promise<string> {
  return (await window.go?.api?.App?.SaveFileDialog?.(name, content)) ?? '';
}

export async function readCollectionTextFiles(root: string): Promise<CollectionTextFilesResult> {
  return (await window.go?.api?.App?.ReadCollectionTextFiles?.(root)) ?? { root, name: '', files: [], error: 'Wails bridge not available' };
}

export async function writeCollectionTextFiles(root: string, files: CollectionTextFile[]): Promise<string> {
  return (await window.go?.api?.App?.WriteCollectionTextFiles?.(root, files)) ?? 'Wails bridge not available';
}

export async function defaultWorkspaceLocation(): Promise<DefaultWorkspaceLocationResult> {
  return (await window.go?.api?.App?.DefaultWorkspaceLocation?.()) ?? { path: '', error: 'Wails bridge not available' };
}

export async function setDefaultWorkspaceLocation(path: string): Promise<DefaultWorkspaceLocationResult> {
  return (await window.go?.api?.App?.SetDefaultWorkspaceLocation?.(path)) ?? { path, error: 'Wails bridge not available' };
}

const EMPTY_GIT_STATUS: GitWorkspaceStatus = {
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

const EMPTY_GIT_OPERATION_RESULT: GitOperationResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  error: 'Wails bridge not available',
  output: '',
  files: [],
  commitCount: 0,
};

const EMPTY_GIT_BRANCH_LIST: GitBranchListResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  current: '',
  localBranches: [],
  remoteBranches: [],
  error: 'Wails bridge not available',
  output: '',
};

const EMPTY_GIT_CONFLICT_FILE: GitConflictFileResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  path: '',
  content: '',
  oursContent: '',
  theirsContent: '',
  oursAvailable: false,
  theirsAvailable: false,
  binary: false,
  truncated: false,
  oursTruncated: false,
  theirsTruncated: false,
  error: 'Wails bridge not available',
  output: '',
};

const EMPTY_GIT_LOG: GitLogResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  commits: [],
  limit: 0,
  offset: 0,
  hasMore: false,
  error: 'Wails bridge not available',
  output: '',
};

export async function gitStatus(): Promise<GitWorkspaceStatus> {
  return (await window.go?.api?.App?.GitStatus?.()) ?? EMPTY_GIT_STATUS;
}

export async function gitDiff(path: string): Promise<GitDiffResult> {
  return (await window.go?.api?.App?.GitDiff?.(path)) ?? { path, diff: '', stagedDiff: '', unstagedDiff: '', binary: false, truncated: false, error: 'Wails bridge not available' };
}

export async function gitOutgoingChanges(): Promise<GitDiffResult> {
  return (await window.go?.api?.App?.GitOutgoingChanges?.()) ?? { path: 'Outgoing changes', diff: '', stagedDiff: '', unstagedDiff: '', binary: false, truncated: false, error: 'Wails bridge not available' };
}

export async function gitCommitLog(limit = 50): Promise<GitLogResult> {
  return (await window.go?.api?.App?.GitCommitLog?.(limit)) ?? EMPTY_GIT_LOG;
}

export async function gitCommitLogPage(limit = 60, offset = 0): Promise<GitLogResult> {
  const page = await window.go?.api?.App?.GitCommitLogPage?.(limit, offset);
  if (page) return page;
  const fallback = await gitCommitLog(limit + Math.max(0, offset));
  const commits = fallback.commits.slice(offset, offset + limit);
  return {
    ...fallback,
    commits,
    limit,
    offset,
    hasMore: fallback.commits.length > offset + limit,
  };
}

export async function gitCommitDiff(commit: string): Promise<GitDiffResult> {
  return (await window.go?.api?.App?.GitCommitDiff?.(commit)) ?? { path: 'Commit diff', diff: '', stagedDiff: '', unstagedDiff: '', binary: false, truncated: false, error: 'Wails bridge not available' };
}

export async function gitConflictFile(path: string): Promise<GitConflictFileResult> {
  return (await window.go?.api?.App?.GitConflictFile?.(path)) ?? EMPTY_GIT_CONFLICT_FILE;
}

export async function gitResolveConflictFile(path: string, resolution: string, content = ''): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitResolveConflictFile?.(path, resolution, content)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitContinueOperation(message = ''): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitContinueOperation?.(message)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitAbortOperation(): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitAbortOperation?.()) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitStashWorkspace(message: string): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitStashWorkspace?.(message)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitStashPopWorkspace(ref = ''): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitStashPopWorkspace?.(ref)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitFetchWorkspace(): Promise<GitWorkspaceStatus> {
  return (await window.go?.api?.App?.GitFetchWorkspace?.()) ?? EMPTY_GIT_STATUS;
}

export async function gitPullWorkspace(strategy = 'ff'): Promise<WorkspaceOpenResult> {
  const app = window.go?.api?.App;
  if (app?.GitPullWorkspaceWithStrategy) return app.GitPullWorkspaceWithStrategy(strategy);
  return (await app?.GitPullWorkspace?.()) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitPullBranch(branchName: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitPullBranch?.(branchName)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitInitWorkspace(): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitInitWorkspace?.()) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitAddRemote(remoteName: string, remoteUrl: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitAddRemote?.(remoteName, remoteUrl)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitTestRemote(remoteNameOrUrl: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitTestRemote?.(remoteNameOrUrl)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitTokenInfo(remoteOrHost: string): Promise<GitTokenInfoResult> {
  return (await window.go?.api?.App?.GitTokenInfo?.(remoteOrHost)) ?? { host: '', hasToken: false, username: '' };
}

export async function gitStoreToken(remoteOrHost: string, username: string, token: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitStoreToken?.(remoteOrHost, username, token)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitClearToken(remoteOrHost: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitClearToken?.(remoteOrHost)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitSetSshKey(workspaceRoot: string, keyPath: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitSetSshKey?.(workspaceRoot, keyPath)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitAuthConfig(workspaceRoot: string): Promise<GitAuthConfigResult> {
  return (await window.go?.api?.App?.GitAuthConfig?.(workspaceRoot)) ?? { method: '', sshKeyPath: '' };
}

export async function gitSshUrlFor(remoteUrl: string): Promise<string> {
  return (await window.go?.api?.App?.GitSshUrlFor?.(remoteUrl)) ?? '';
}

export async function gitRemoteUrl(remoteName: string): Promise<string> {
  return (await window.go?.api?.App?.GitRemoteUrl?.(remoteName)) ?? '';
}

export async function gitSetRemoteUrl(remoteName: string, remoteUrl: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitSetRemoteUrl?.(remoteName, remoteUrl)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitListBranches(): Promise<GitBranchListResult> {
  return (await window.go?.api?.App?.GitBranches?.()) ?? EMPTY_GIT_BRANCH_LIST;
}

export async function gitCheckoutBranch(branchName: string): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitCheckoutBranch?.(branchName)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitCreateBranch(branchName: string, startPoint = ''): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitCreateBranch?.(branchName, startPoint)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitCreateTrackingBranch(branchName: string, startPoint = ''): Promise<WorkspaceOpenResult> {
  const app = window.go?.api?.App;
  return (await app?.GitCreateTrackingBranch?.(branchName, startPoint))
    ?? (await app?.GitCreateBranch?.(branchName, startPoint))
    ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitDeleteBranch(branchName: string, remote = false, force = false): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitDeleteBranch?.(branchName, remote, force)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitRenameBranch(branchName: string, newName: string, remote = false): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitRenameBranch?.(branchName, newName, remote)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitStageWorkspaceFiles(): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitStageWorkspaceFiles?.()) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitCommitWorkspace(message: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitCommitWorkspace?.(message)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitCommitWorkspaceFiles(paths: string[], message: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitCommitWorkspaceFiles?.(paths, message)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitPushWorkspace(remoteName: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitPushWorkspace?.(remoteName)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitForcePushWorkspace(remoteName: string): Promise<GitOperationResult> {
  return (await window.go?.api?.App?.GitForcePushWorkspace?.(remoteName)) ?? EMPTY_GIT_OPERATION_RESULT;
}

export async function gitDiscardWorkspaceFile(path: string): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitDiscardWorkspaceFile?.(path)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitDiscardWorkspaceFiles(paths: string[]): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitDiscardWorkspaceFiles?.(paths)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitDiscardWorkspaceChanges(): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.GitDiscardWorkspaceChanges?.()) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitCloneWorkspace(remoteUrl: string, parentDir: string, directoryName = '', initMode = 'empty'): Promise<WorkspaceOpenResult> {
  const app = window.go?.api?.App;
  if (app?.GitCloneWorkspaceWithMode) return app.GitCloneWorkspaceWithMode(remoteUrl, parentDir, directoryName, initMode);
  return (await app?.GitCloneWorkspace?.(remoteUrl, parentDir, directoryName)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function gitCloneWorkspaceWithAuth(remoteUrl: string, parentDir: string, directoryName = '', initMode = 'empty', sshKeyPath = '', overwrite = false): Promise<WorkspaceOpenResult> {
  const app = window.go?.api?.App;
  if (app?.GitCloneWorkspaceWithAuth) return app.GitCloneWorkspaceWithAuth(remoteUrl, parentDir, directoryName, initMode, sshKeyPath, overwrite);
  return gitCloneWorkspace(remoteUrl, parentDir, directoryName, initMode);
}

export async function openWorkspaceRoot(path: string): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.OpenWorkspaceRoot?.(path)) ?? { ok: false, root: path, payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function useLocalWorkspaceStore(): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.UseLocalWorkspaceStore?.()) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function createLocalWorkspaceRoot(parentDir: string, directoryName: string, initMode = 'empty'): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.CreateLocalWorkspaceRoot?.(parentDir, directoryName, initMode)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function saveWorkspaceSecrets(values: Record<string, string>): Promise<WorkspaceOpenResult> {
  return (await window.go?.api?.App?.SaveWorkspaceSecrets?.(values)) ?? { ok: false, root: '', payload: '', git: EMPTY_GIT_STATUS, missingSecrets: [], error: 'Wails bridge not available', output: '' };
}

export async function fetchOAuth2Token(auth: AuthConfig): Promise<OAuth2TokenResponse | null> {
  return (await window.go?.api?.App?.FetchOAuth2Token?.(auth)) ?? null;
}

export async function authorizeOAuth2(auth: AuthConfig): Promise<OAuth2TokenResponse | null> {
  return (await window.go?.api?.App?.AuthorizeOAuth2?.(auth)) ?? null;
}

export async function refreshOAuth2Token(auth: AuthConfig): Promise<OAuth2TokenResponse | null> {
  return (await window.go?.api?.App?.RefreshOAuth2Token?.(auth)) ?? null;
}

export async function sseConnect(sessionId: string, req: HttpRequest): Promise<void> {
  await window.go?.api?.App?.SSEConnect?.(sessionId, req);
}

export async function sseDisconnect(sessionId: string): Promise<void> {
  await window.go?.api?.App?.SSEDisconnect?.(sessionId);
}

export async function webSocketConnect(sessionId: string, req: HttpRequest): Promise<void> {
  await window.go?.api?.App?.WebSocketConnect?.(sessionId, req);
}

export async function webSocketDisconnect(sessionId: string): Promise<void> {
  await window.go?.api?.App?.WebSocketDisconnect?.(sessionId);
}

export async function webSocketSend(sessionId: string, msg: WebSocketSendMessage): Promise<WebSocketSendResult> {
  return (await window.go?.api?.App?.WebSocketSend?.(sessionId, msg)) ?? { ok: false, error: 'Wails bridge not available' };
}

export async function socketIOConnect(sessionId: string, req: HttpRequest): Promise<void> {
  await window.go?.api?.App?.SocketIOConnect?.(sessionId, req);
}

export async function socketIODisconnect(sessionId: string): Promise<void> {
  await window.go?.api?.App?.SocketIODisconnect?.(sessionId);
}

export async function socketIOEmit(sessionId: string, msg: SocketIOEmitMessage): Promise<SocketIOEmitResult> {
  return (await window.go?.api?.App?.SocketIOEmit?.(sessionId, msg)) ?? { ok: false, error: 'Wails bridge not available' };
}
