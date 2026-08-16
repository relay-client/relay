// The wire types are the Go structs in internal/model and internal/api. They are
// not restated here: Wails generates them into wailsjs/go/models.ts from the Go
// source, and this file derives from that. A field added on the Go side reaches
// the interface by regenerating, not by someone remembering to edit two files —
// which is how `wsKeepAliveIntervalMs`, `sseDisableReconnect` and
// `sseReconnectIntervalMs` ended up implemented in Go and unreachable from the
// app for two releases.
import type { api, model } from '../../wailsjs/go/models';

// Wails emits classes so a response can be rehydrated with `new Model(json)`.
// `convertValues` is that machinery, not part of the payload, so it is stripped:
// otherwise every plain object literal the app builds would be missing a method
// and fail to typecheck. The mapping is homomorphic, so optional fields stay
// optional.
type Wire<T> = T extends (infer U)[]
  ? Wire<U>[]
  : T extends object
    ? { [K in keyof T as K extends 'convertValues' ? never : K]: Wire<T[K]> }
    : T;

/* Bound Go methods — one line each, shape owned by Go. */
export type AppInfo = Wire<model.AppInfo>;
export type AuthConfig = Wire<model.AuthConfig>;
export type ConnectionInfo = Wire<model.ConnectionInfo>;
export type CookieJarResult = Wire<model.CookieJarResult>;
export type GrpcMessage = Wire<model.GrpcMessage>;
export type GrpcMethodInfo = Wire<model.GrpcMethodInfo>;
export type GrpcRequest = Wire<model.GrpcRequest>;
export type GrpcResponse = Wire<model.GrpcResponse>;
export type GrpcServiceDefinition = Wire<model.GrpcServiceDefinition>;
export type HttpRequest = Wire<model.HttpRequest>;
export type HttpResponse = Wire<model.HttpResponse>;
export type KeyValue = Wire<model.KeyValue>;
export type OAuth2TokenResponse = Wire<model.OAuth2TokenResponse>;
export type ScriptResult = Wire<model.ScriptResult>;
export type SentRequest = Wire<model.SentRequest>;
export type SocketIOEmitMessage = Wire<model.SocketIOEmitMessage>;
export type SocketIOEmitResult = Wire<model.SocketIOEmitResult>;
export type TestResult = Wire<model.TestResult>;
export type TimelineEvent = Wire<model.TimelineEvent>;
export type UpdateCheckResult = Wire<model.UpdateCheckResult>;
export type UpdateInfo = Wire<model.UpdateInfo>;
export type WebSocketSendMessage = Wire<model.WebSocketSendMessage>;
export type WebSocketSendResult = Wire<model.WebSocketSendResult>;

export type CollectionTextFile = Wire<api.CollectionTextFile>;
export type CollectionTextFilesResult = Wire<api.CollectionTextFilesResult>;
export type DefaultWorkspaceLocationResult = Wire<api.DefaultWorkspaceLocationResult>;
export type DownloadResult = Wire<api.DownloadResult>;
export type GitAuthConfigResult = Wire<api.GitAuthConfigResult>;
export type GitBranchEntry = Wire<api.GitBranchEntry>;
export type GitBranchListResult = Wire<api.GitBranchListResult>;
export type GitCommitEntry = Wire<api.GitCommitEntry>;
export type GitConflictFileResult = Wire<api.GitConflictFileResult>;
export type GitDiffResult = Wire<api.GitDiffResult>;
export type GitFileStatus = Wire<api.GitFileStatus>;
export type GitLogResult = Wire<api.GitLogResult>;
export type GitOperationResult = Wire<api.GitOperationResult>;
export type GitPullSummary = Wire<api.GitPullSummary>;
export type GitStashEntry = Wire<api.GitStashEntry>;
export type GitTokenInfoResult = Wire<api.GitTokenInfoResult>;
export type GitWorkspaceStatus = Wire<api.GitWorkspaceStatus>;
export type SaveRequestStoreResult = Wire<api.SaveRequestStoreResult>;
export type WorkspaceDiagnostic = Wire<api.WorkspaceDiagnostic>;
export type WorkspaceOpenResult = Wire<api.WorkspaceOpenResult>;
export type WorkspaceSecretRef = Wire<api.WorkspaceSecretRef>;
export type WorkspaceYAMLFileResult = Wire<api.WorkspaceYAMLFileResult>;
export type HistoryResponseResult = Wire<api.HistoryResponseResult>;

// Names the app uses that differ from the Go type's.
export type CookieJarEntry = Wire<model.Cookie>;
export type ResponseTimings = Wire<model.ResponseTime>;

/* Payloads that arrive over the runtime event bus rather than as the return
   value of a bound method. Wails only generates types it can reach from a bound
   signature, so these are the one place a Go struct is still restated by hand —
   keep them in step with grpcHeadersEvent/grpcMessageEvent/grpcTrailersEvent in
   internal/api/grpc.go and OAuth2DevicePrompt in internal/model/http.go. */
export type OAuth2DevicePrompt = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
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

// The Wails runtime, which is injected by the desktop shell rather than bound
// from Go. Every member is optional because the app also runs as a plain page in
// a browser during development, where none of this exists.
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

// The bridge the desktop shell puts on `window`, derived from the generated
// bindings so the method list cannot drift from what Go actually exposes.
// Methods are optional for the same reason as above: in a browser there is no
// bridge, and every call site checks before calling.
type AppBindings = typeof import('../../wailsjs/go/api/App');

type WireFn<F> = F extends (...args: infer A) => Promise<infer R>
  ? (...args: { [I in keyof A]: Wire<A[I]> }) => Promise<Wire<R>>
  : never;

export type AppBridge = { [K in keyof AppBindings]?: WireFn<AppBindings[K]> };

declare global {
  interface Window {
    runtime?: RuntimeBridge;
    go?: { api?: { App?: AppBridge } };
  }
}

// Zero values for the two big wire structs. A synthetic request or response —
// a schema introspection, or the shell a realtime panel renders before any
// bytes arrive — spreads one of these and overrides what it means, instead of
// listing fifty fields it does not care about and falling behind Go on the next
// one. The values mirror Go's own zero values.
export function emptyResponseTimings(): ResponseTimings {
  return {
    total: 0, prepare: 0, socketInitialization: 0, dnsLookup: 0,
    tcpHandshake: 0, tlsHandshake: 0, waitingTTFB: 0, download: 0, process: 0,
  };
}

export function emptyScriptResult(): ScriptResult {
  return { tests: [], logs: [], error: '' };
}

export function emptyConnectionInfo(): ConnectionInfo {
  return { reused: false, wasIdle: false };
}

export function emptyHttpRequest(): HttpRequest {
  return {
    requestId: '', workspaceId: '', method: '', url: '',
    params: [], headers: [], auth: emptyAuthConfig(),
    bodyType: '', body: '', bodyFilePath: '', formData: [],
    preRequestScript: '', testScript: '', scriptEngine: '',
    followRedirects: false, timeoutMs: 0, name: '',
    scriptTimeoutMs: 0, allowSendRequest: false,
    httpVersion: '', enableSSLVerification: false,
    followOriginalMethod: false, followAuthorizationHeader: false,
    removeRefererHeader: false, encodeUrlAutomatically: false,
    disableCookieJar: false, maxRedirects: 0,
    secretEnvironmentKeys: [], secretEnvironmentValues: [], collectionVariables: {},
    proxyUrl: '', proxyMode: '', proxyBypass: '',
    clientCertPath: '', clientKeyPath: '', clientKeyPassword: '',
    browserEmulation: false, browserOrigin: '', browserWithCredentials: false,
    browserEnforceCORS: false, browserEnforceCSP: false, browserCSP: '',
    wsHandshakeTimeoutMs: 0, wsReconnectAttempts: 0, wsReconnectIntervalMs: 0,
    wsMaxMessageSizeMb: 0, wsKeepAliveIntervalMs: 0,
    sioClientVersion: '', sioPath: '', sioNamespace: '', sioListenEvents: [],
    sseDisableReconnect: false, sseReconnectIntervalMs: 0,
  };
}

export function emptyHttpResponse(): HttpResponse {
  return {
    statusCode: 0, status: '', headers: [], body: '', duration: 0,
    timings: emptyResponseTimings(), size: 0,
    preRequestResult: emptyScriptResult(), testResult: emptyScriptResult(),
    connection: emptyConnectionInfo(),
  };
}

// The zero value of AuthConfig. A request that deliberately sends no
// credentials — a schema introspection, say — spells that as a spread of this
// rather than restating all twenty-odd fields, which is how such a literal
// silently falls behind the Go struct.
export function emptyAuthConfig(): AuthConfig {
  return {
    type: 'none',
    token: '',
    username: '',
    password: '',
    keyName: '',
    keyValue: '',
    keyIn: 'header',
    oauth2GrantType: '',
    oauth2TokenURL: '',
    oauth2AuthURL: '',
    oauth2DeviceAuthURL: '',
    oauth2RedirectURL: '',
    oauth2ClientID: '',
    oauth2Secret: '',
    oauth2Scope: '',
    oauth2Audience: '',
    oauth2UsePKCE: false,
    oauth2RefreshToken: '',
    oauth2InsecureSkipVerify: false,
    oauth2Username: '',
    oauth2Password: '',
    oauth2ClientAuth: '',
    oauth2AssertionAlgorithm: '',
    oauth2AssertionPrivateKey: '',
    oauth2AssertionKeyID: '',
    oauth2AssertionAudience: '',
    awsAccessKey: '',
    awsSecretKey: '',
    awsSessionToken: '',
    awsRegion: '',
    awsService: '',
  };
}

// The zero value of the Go struct, kept beside the type it mirrors so the two
// cannot drift. Everything that needs a blank git status imports this one.
export const EMPTY_GIT_STATUS: GitWorkspaceStatus = {
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
  gitMissing: false,
  authRequired: false,
  authScheme: '',
  authHost: '',
  tokenRejected: false,
  error: '',
};

export const EMPTY_GIT_PULL_SUMMARY: GitPullSummary = { changed: 0, added: 0, updated: 0, deleted: 0, renamed: 0 };

// One "the bridge isn't here" value per result shape, typed against the
// generated Go struct. The eighteen copies of this literal that used to be
// inline all drifted together the moment Go grew a field; now the compiler
// points at exactly one place.
export const EMPTY_WORKSPACE_OPEN_RESULT: WorkspaceOpenResult = {
  ok: false,
  root: '',
  payload: '',
  git: EMPTY_GIT_STATUS,
  missingSecrets: [],
  diagnostics: [],
  pullSummary: EMPTY_GIT_PULL_SUMMARY,
  targetExists: false,
  error: 'Wails bridge not available',
  output: '',
};

export const EMPTY_GIT_OPERATION_RESULT: GitOperationResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  pullSummary: EMPTY_GIT_PULL_SUMMARY,
  error: 'Wails bridge not available',
  output: '',
  files: [],
  commitCount: 0,
};

export const EMPTY_GIT_BRANCH_LIST: GitBranchListResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  current: '',
  localBranches: [],
  remoteBranches: [],
  error: 'Wails bridge not available',
  output: '',
};

export const EMPTY_GIT_CONFLICT_FILE: GitConflictFileResult = {
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

export const EMPTY_GIT_LOG: GitLogResult = {
  ok: false,
  git: EMPTY_GIT_STATUS,
  commits: [],
  limit: 0,
  offset: 0,
  hasMore: false,
  error: 'Wails bridge not available',
  output: '',
};
