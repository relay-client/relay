export namespace api {
	
	export class CollectionTextFile {
	    path: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new CollectionTextFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.content = source["content"];
	    }
	}
	export class CollectionTextFilesResult {
	    root: string;
	    name: string;
	    files: CollectionTextFile[];
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new CollectionTextFilesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.root = source["root"];
	        this.name = source["name"];
	        this.files = this.convertValues(source["files"], CollectionTextFile);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DefaultWorkspaceLocationResult {
	    path: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new DefaultWorkspaceLocationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	}
	export class DownloadResult {
	    response: model.HttpResponse;
	    savedPath: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.response = this.convertValues(source["response"], model.HttpResponse);
	        this.savedPath = source["savedPath"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GitAuthConfigResult {
	    method: string;
	    sshKeyPath: string;
	
	    static createFrom(source: any = {}) {
	        return new GitAuthConfigResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.method = source["method"];
	        this.sshKeyPath = source["sshKeyPath"];
	    }
	}
	export class GitBranchEntry {
	    name: string;
	    fullName: string;
	    remote: string;
	    current: boolean;
	    upstream: string;
	
	    static createFrom(source: any = {}) {
	        return new GitBranchEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.fullName = source["fullName"];
	        this.remote = source["remote"];
	        this.current = source["current"];
	        this.upstream = source["upstream"];
	    }
	}
	export class GitStashEntry {
	    ref: string;
	    index: number;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new GitStashEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ref = source["ref"];
	        this.index = source["index"];
	        this.message = source["message"];
	    }
	}
	export class GitFileStatus {
	    path: string;
	    index: string;
	    worktree: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new GitFileStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.index = source["index"];
	        this.worktree = source["worktree"];
	        this.status = source["status"];
	    }
	}
	export class GitWorkspaceStatus {
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
	    authRequired: boolean;
	    authScheme: string;
	    authHost: string;
	    tokenRejected: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GitWorkspaceStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isRepo = source["isRepo"];
	        this.workspaceRoot = source["workspaceRoot"];
	        this.root = source["root"];
	        this.missingRoot = source["missingRoot"];
	        this.branch = source["branch"];
	        this.head = source["head"];
	        this.upstream = source["upstream"];
	        this.upstreamGone = source["upstreamGone"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.pushCommitCount = source["pushCommitCount"];
	        this.pushRemote = source["pushRemote"];
	        this.operation = source["operation"];
	        this.clean = source["clean"];
	        this.files = this.convertValues(source["files"], GitFileStatus);
	        this.remotes = source["remotes"];
	        this.stashes = this.convertValues(source["stashes"], GitStashEntry);
	        this.error = source["error"];
	        this.authRequired = source["authRequired"];
	        this.authScheme = source["authScheme"];
	        this.authHost = source["authHost"];
	        this.tokenRejected = source["tokenRejected"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GitBranchListResult {
	    ok: boolean;
	    git: GitWorkspaceStatus;
	    current: string;
	    localBranches: GitBranchEntry[];
	    remoteBranches: GitBranchEntry[];
	    error: string;
	    output: string;
	
	    static createFrom(source: any = {}) {
	        return new GitBranchListResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.git = this.convertValues(source["git"], GitWorkspaceStatus);
	        this.current = source["current"];
	        this.localBranches = this.convertValues(source["localBranches"], GitBranchEntry);
	        this.remoteBranches = this.convertValues(source["remoteBranches"], GitBranchEntry);
	        this.error = source["error"];
	        this.output = source["output"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GitCommitEntry {
	    hash: string;
	    shortHash: string;
	    author: string;
	    date: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new GitCommitEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.shortHash = source["shortHash"];
	        this.author = source["author"];
	        this.date = source["date"];
	        this.message = source["message"];
	    }
	}
	export class GitConflictFileResult {
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
	
	    static createFrom(source: any = {}) {
	        return new GitConflictFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.git = this.convertValues(source["git"], GitWorkspaceStatus);
	        this.path = source["path"];
	        this.content = source["content"];
	        this.oursContent = source["oursContent"];
	        this.theirsContent = source["theirsContent"];
	        this.oursAvailable = source["oursAvailable"];
	        this.theirsAvailable = source["theirsAvailable"];
	        this.binary = source["binary"];
	        this.truncated = source["truncated"];
	        this.oursTruncated = source["oursTruncated"];
	        this.theirsTruncated = source["theirsTruncated"];
	        this.error = source["error"];
	        this.output = source["output"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GitDiffResult {
	    path: string;
	    diff: string;
	    stagedDiff: string;
	    unstagedDiff: string;
	    binary: boolean;
	    truncated: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new GitDiffResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.diff = source["diff"];
	        this.stagedDiff = source["stagedDiff"];
	        this.unstagedDiff = source["unstagedDiff"];
	        this.binary = source["binary"];
	        this.truncated = source["truncated"];
	        this.error = source["error"];
	    }
	}
	
	export class GitLogResult {
	    ok: boolean;
	    git: GitWorkspaceStatus;
	    commits: GitCommitEntry[];
	    limit: number;
	    offset: number;
	    hasMore: boolean;
	    error: string;
	    output: string;
	
	    static createFrom(source: any = {}) {
	        return new GitLogResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.git = this.convertValues(source["git"], GitWorkspaceStatus);
	        this.commits = this.convertValues(source["commits"], GitCommitEntry);
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	        this.hasMore = source["hasMore"];
	        this.error = source["error"];
	        this.output = source["output"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GitPullSummary {
	    changed: number;
	    added: number;
	    updated: number;
	    deleted: number;
	    renamed: number;
	
	    static createFrom(source: any = {}) {
	        return new GitPullSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.changed = source["changed"];
	        this.added = source["added"];
	        this.updated = source["updated"];
	        this.deleted = source["deleted"];
	        this.renamed = source["renamed"];
	    }
	}
	export class GitOperationResult {
	    ok: boolean;
	    git: GitWorkspaceStatus;
	    error: string;
	    output: string;
	    files: string[];
	    pullSummary: GitPullSummary;
	    commitCount: number;
	
	    static createFrom(source: any = {}) {
	        return new GitOperationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.git = this.convertValues(source["git"], GitWorkspaceStatus);
	        this.error = source["error"];
	        this.output = source["output"];
	        this.files = source["files"];
	        this.pullSummary = this.convertValues(source["pullSummary"], GitPullSummary);
	        this.commitCount = source["commitCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class GitTokenInfoResult {
	    host: string;
	    hasToken: boolean;
	    username: string;
	
	    static createFrom(source: any = {}) {
	        return new GitTokenInfoResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.hasToken = source["hasToken"];
	        this.username = source["username"];
	    }
	}
	
	export class SaveRequestStoreResult {
	    ok: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequestStoreResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	    }
	}
	export class WorkspaceDiagnostic {
	    scope: string;
	    severity: string;
	    path: string;
	    message: string;
	    workspaceId?: string;
	    collectionId?: string;
	    requestId?: string;
	    line?: number;
	    column?: number;
	    blocking: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceDiagnostic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scope = source["scope"];
	        this.severity = source["severity"];
	        this.path = source["path"];
	        this.message = source["message"];
	        this.workspaceId = source["workspaceId"];
	        this.collectionId = source["collectionId"];
	        this.requestId = source["requestId"];
	        this.line = source["line"];
	        this.column = source["column"];
	        this.blocking = source["blocking"];
	    }
	}
	export class WorkspaceSecretRef {
	    key: string;
	    label: string;
	    scope: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceSecretRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.label = source["label"];
	        this.scope = source["scope"];
	    }
	}
	export class WorkspaceOpenResult {
	    ok: boolean;
	    root: string;
	    payload: string;
	    git: GitWorkspaceStatus;
	    missingSecrets: WorkspaceSecretRef[];
	    diagnostics: WorkspaceDiagnostic[];
	    error: string;
	    output: string;
	    pullSummary: GitPullSummary;
	    targetExists: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceOpenResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.root = source["root"];
	        this.payload = source["payload"];
	        this.git = this.convertValues(source["git"], GitWorkspaceStatus);
	        this.missingSecrets = this.convertValues(source["missingSecrets"], WorkspaceSecretRef);
	        this.diagnostics = this.convertValues(source["diagnostics"], WorkspaceDiagnostic);
	        this.error = source["error"];
	        this.output = source["output"];
	        this.pullSummary = this.convertValues(source["pullSummary"], GitPullSummary);
	        this.targetExists = source["targetExists"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WorkspaceYAMLFileResult {
	    ok: boolean;
	    path: string;
	    content: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceYAMLFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.path = source["path"];
	        this.content = source["content"];
	        this.error = source["error"];
	    }
	}

}

export namespace model {
	
	export class AppInfo {
	    name: string;
	    version: string;
	    runtime: string;
	    goVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.runtime = source["runtime"];
	        this.goVersion = source["goVersion"];
	    }
	}
	export class AuthConfig {
	    type: string;
	    token: string;
	    username: string;
	    password: string;
	    keyName: string;
	    keyValue: string;
	    keyIn: string;
	    oauth2GrantType: string;
	    oauth2TokenURL: string;
	    oauth2AuthURL: string;
	    oauth2DeviceAuthURL: string;
	    oauth2RedirectURL: string;
	    oauth2ClientID: string;
	    oauth2Secret: string;
	    oauth2Scope: string;
	    oauth2Audience: string;
	    oauth2UsePKCE: boolean;
	    oauth2RefreshToken: string;
	    oauth2InsecureSkipVerify: boolean;
	    oauth2Username: string;
	    oauth2Password: string;
	    oauth2ClientAuth: string;
	    oauth2AssertionAlgorithm: string;
	    oauth2AssertionPrivateKey: string;
	    oauth2AssertionKeyID: string;
	    oauth2AssertionAudience: string;
	    awsAccessKey: string;
	    awsSecretKey: string;
	    awsSessionToken: string;
	    awsRegion: string;
	    awsService: string;
	
	    static createFrom(source: any = {}) {
	        return new AuthConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.token = source["token"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.keyName = source["keyName"];
	        this.keyValue = source["keyValue"];
	        this.keyIn = source["keyIn"];
	        this.oauth2GrantType = source["oauth2GrantType"];
	        this.oauth2TokenURL = source["oauth2TokenURL"];
	        this.oauth2AuthURL = source["oauth2AuthURL"];
	        this.oauth2DeviceAuthURL = source["oauth2DeviceAuthURL"];
	        this.oauth2RedirectURL = source["oauth2RedirectURL"];
	        this.oauth2ClientID = source["oauth2ClientID"];
	        this.oauth2Secret = source["oauth2Secret"];
	        this.oauth2Scope = source["oauth2Scope"];
	        this.oauth2Audience = source["oauth2Audience"];
	        this.oauth2UsePKCE = source["oauth2UsePKCE"];
	        this.oauth2RefreshToken = source["oauth2RefreshToken"];
	        this.oauth2InsecureSkipVerify = source["oauth2InsecureSkipVerify"];
	        this.oauth2Username = source["oauth2Username"];
	        this.oauth2Password = source["oauth2Password"];
	        this.oauth2ClientAuth = source["oauth2ClientAuth"];
	        this.oauth2AssertionAlgorithm = source["oauth2AssertionAlgorithm"];
	        this.oauth2AssertionPrivateKey = source["oauth2AssertionPrivateKey"];
	        this.oauth2AssertionKeyID = source["oauth2AssertionKeyID"];
	        this.oauth2AssertionAudience = source["oauth2AssertionAudience"];
	        this.awsAccessKey = source["awsAccessKey"];
	        this.awsSecretKey = source["awsSecretKey"];
	        this.awsSessionToken = source["awsSessionToken"];
	        this.awsRegion = source["awsRegion"];
	        this.awsService = source["awsService"];
	    }
	}
	export class ConnectionInfo {
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
	
	    static createFrom(source: any = {}) {
	        return new ConnectionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reused = source["reused"];
	        this.wasIdle = source["wasIdle"];
	        this.localAddr = source["localAddr"];
	        this.remoteAddr = source["remoteAddr"];
	        this.protocol = source["protocol"];
	        this.tlsVersion = source["tlsVersion"];
	        this.tlsCipher = source["tlsCipher"];
	        this.alpn = source["alpn"];
	        this.serverName = source["serverName"];
	        this.addresses = source["addresses"];
	    }
	}
	export class Cookie {
	    name: string;
	    value: string;
	    domain: string;
	    path: string;
	    expiresAt: number;
	    session: boolean;
	    secure: boolean;
	    httpOnly: boolean;
	    sameSite: string;
	    hostOnly: boolean;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Cookie(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.domain = source["domain"];
	        this.path = source["path"];
	        this.expiresAt = source["expiresAt"];
	        this.session = source["session"];
	        this.secure = source["secure"];
	        this.httpOnly = source["httpOnly"];
	        this.sameSite = source["sameSite"];
	        this.hostOnly = source["hostOnly"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class CookieJarResult {
	    cookies: Cookie[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new CookieJarResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cookies = this.convertValues(source["cookies"], Cookie);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GrpcMessage {
	    index: number;
	    direction?: string;
	    body: string;
	    size: number;
	    timestamp: number;
	
	    static createFrom(source: any = {}) {
	        return new GrpcMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.direction = source["direction"];
	        this.body = source["body"];
	        this.size = source["size"];
	        this.timestamp = source["timestamp"];
	    }
	}
	export class GrpcMethodInfo {
	    fullName: string;
	    service: string;
	    name: string;
	    requestType: string;
	    responseType: string;
	    exampleMessage: string;
	    clientStreaming: boolean;
	    serverStreaming: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GrpcMethodInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fullName = source["fullName"];
	        this.service = source["service"];
	        this.name = source["name"];
	        this.requestType = source["requestType"];
	        this.responseType = source["responseType"];
	        this.exampleMessage = source["exampleMessage"];
	        this.clientStreaming = source["clientStreaming"];
	        this.serverStreaming = source["serverStreaming"];
	    }
	}
	export class KeyValue {
	    key: string;
	    value: string;
	    enabled: boolean;
	    isFile: boolean;
	    fileName: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyValue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	        this.isFile = source["isFile"];
	        this.fileName = source["fileName"];
	    }
	}
	export class GrpcRequest {
	    requestId: string;
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
	    scriptEngine: string;
	    name: string;
	    scriptTimeoutMs: number;
	    allowSendRequest: boolean;
	    secretEnvironmentKeys: string[];
	    secretEnvironmentValues: string[];
	    collectionVariables: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new GrpcRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.requestId = source["requestId"];
	        this.target = source["target"];
	        this.fullMethod = source["fullMethod"];
	        this.message = source["message"];
	        this.metadata = this.convertValues(source["metadata"], KeyValue);
	        this.auth = this.convertValues(source["auth"], AuthConfig);
	        this.useReflection = source["useReflection"];
	        this.protoFilePath = source["protoFilePath"];
	        this.protoImportPaths = source["protoImportPaths"];
	        this.useTls = source["useTls"];
	        this.enableSSLVerification = source["enableSSLVerification"];
	        this.serverName = source["serverName"];
	        this.includeDefaultValues = source["includeDefaultValues"];
	        this.maxResponseMessageSizeMb = source["maxResponseMessageSizeMb"];
	        this.timeoutMs = source["timeoutMs"];
	        this.preRequestScript = source["preRequestScript"];
	        this.testScript = source["testScript"];
	        this.scriptEngine = source["scriptEngine"];
	        this.name = source["name"];
	        this.scriptTimeoutMs = source["scriptTimeoutMs"];
	        this.allowSendRequest = source["allowSendRequest"];
	        this.secretEnvironmentKeys = source["secretEnvironmentKeys"];
	        this.secretEnvironmentValues = source["secretEnvironmentValues"];
	        this.collectionVariables = source["collectionVariables"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TestResult {
	    name: string;
	    passed: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.passed = source["passed"];
	        this.error = source["error"];
	    }
	}
	export class ScriptResult {
	    tests: TestResult[];
	    logs?: string[];
	    error?: string;
	    skippedRequest?: boolean;
	    collectionVariables?: Record<string, string>;
	    collectionVariablesRemoved?: string[];
	
	    static createFrom(source: any = {}) {
	        return new ScriptResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tests = this.convertValues(source["tests"], TestResult);
	        this.logs = source["logs"];
	        this.error = source["error"];
	        this.skippedRequest = source["skippedRequest"];
	        this.collectionVariables = source["collectionVariables"];
	        this.collectionVariablesRemoved = source["collectionVariablesRemoved"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GrpcResponse {
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
	
	    static createFrom(source: any = {}) {
	        return new GrpcResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.grpcCode = source["grpcCode"];
	        this.grpcMessage = source["grpcMessage"];
	        this.status = source["status"];
	        this.headers = this.convertValues(source["headers"], KeyValue);
	        this.trailers = this.convertValues(source["trailers"], KeyValue);
	        this.messages = this.convertValues(source["messages"], GrpcMessage);
	        this.body = source["body"];
	        this.duration = source["duration"];
	        this.size = source["size"];
	        this.timestamp = source["timestamp"];
	        this.error = source["error"];
	        this.method = this.convertValues(source["method"], GrpcMethodInfo);
	        this.preRequestResult = this.convertValues(source["preRequestResult"], ScriptResult);
	        this.testResult = this.convertValues(source["testResult"], ScriptResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GrpcServiceDefinition {
	    source: string;
	    services: string[];
	    methods: GrpcMethodInfo[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new GrpcServiceDefinition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.services = source["services"];
	        this.methods = this.convertValues(source["methods"], GrpcMethodInfo);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HttpRequest {
	    requestId: string;
	    workspaceId: string;
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
	    scriptEngine: string;
	    followRedirects: boolean;
	    timeoutMs: number;
	    name: string;
	    scriptTimeoutMs: number;
	    allowSendRequest: boolean;
	    iteration?: number;
	    iterationCount?: number;
	    httpVersion: string;
	    enableSSLVerification: boolean;
	    followOriginalMethod: boolean;
	    followAuthorizationHeader: boolean;
	    removeRefererHeader: boolean;
	    encodeUrlAutomatically: boolean;
	    disableCookieJar: boolean;
	    maxRedirects: number;
	    secretEnvironmentKeys: string[];
	    secretEnvironmentValues: string[];
	    collectionVariables: Record<string, string>;
	    iterationData?: Record<string, string>;
	    proxyUrl: string;
	    proxyMode: string;
	    proxyBypass: string;
	    clientCertPath: string;
	    clientKeyPath: string;
	    clientKeyPassword: string;
	    browserEmulation: boolean;
	    browserOrigin: string;
	    browserWithCredentials: boolean;
	    browserEnforceCORS: boolean;
	    browserEnforceCSP: boolean;
	    browserCSP: string;
	    wsHandshakeTimeoutMs: number;
	    wsReconnectAttempts: number;
	    wsReconnectIntervalMs: number;
	    wsMaxMessageSizeMb: number;
	    wsKeepAliveIntervalMs: number;
	    sioClientVersion: string;
	    sioPath: string;
	    sioNamespace: string;
	    sioListenEvents: string[];
	    sseDisableReconnect: boolean;
	    sseReconnectIntervalMs: number;
	
	    static createFrom(source: any = {}) {
	        return new HttpRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.requestId = source["requestId"];
	        this.workspaceId = source["workspaceId"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.params = this.convertValues(source["params"], KeyValue);
	        this.headers = this.convertValues(source["headers"], KeyValue);
	        this.auth = this.convertValues(source["auth"], AuthConfig);
	        this.bodyType = source["bodyType"];
	        this.body = source["body"];
	        this.bodyFilePath = source["bodyFilePath"];
	        this.formData = this.convertValues(source["formData"], KeyValue);
	        this.preRequestScript = source["preRequestScript"];
	        this.testScript = source["testScript"];
	        this.scriptEngine = source["scriptEngine"];
	        this.followRedirects = source["followRedirects"];
	        this.timeoutMs = source["timeoutMs"];
	        this.name = source["name"];
	        this.scriptTimeoutMs = source["scriptTimeoutMs"];
	        this.allowSendRequest = source["allowSendRequest"];
	        this.iteration = source["iteration"];
	        this.iterationCount = source["iterationCount"];
	        this.httpVersion = source["httpVersion"];
	        this.enableSSLVerification = source["enableSSLVerification"];
	        this.followOriginalMethod = source["followOriginalMethod"];
	        this.followAuthorizationHeader = source["followAuthorizationHeader"];
	        this.removeRefererHeader = source["removeRefererHeader"];
	        this.encodeUrlAutomatically = source["encodeUrlAutomatically"];
	        this.disableCookieJar = source["disableCookieJar"];
	        this.maxRedirects = source["maxRedirects"];
	        this.secretEnvironmentKeys = source["secretEnvironmentKeys"];
	        this.secretEnvironmentValues = source["secretEnvironmentValues"];
	        this.collectionVariables = source["collectionVariables"];
	        this.iterationData = source["iterationData"];
	        this.proxyUrl = source["proxyUrl"];
	        this.proxyMode = source["proxyMode"];
	        this.proxyBypass = source["proxyBypass"];
	        this.clientCertPath = source["clientCertPath"];
	        this.clientKeyPath = source["clientKeyPath"];
	        this.clientKeyPassword = source["clientKeyPassword"];
	        this.browserEmulation = source["browserEmulation"];
	        this.browserOrigin = source["browserOrigin"];
	        this.browserWithCredentials = source["browserWithCredentials"];
	        this.browserEnforceCORS = source["browserEnforceCORS"];
	        this.browserEnforceCSP = source["browserEnforceCSP"];
	        this.browserCSP = source["browserCSP"];
	        this.wsHandshakeTimeoutMs = source["wsHandshakeTimeoutMs"];
	        this.wsReconnectAttempts = source["wsReconnectAttempts"];
	        this.wsReconnectIntervalMs = source["wsReconnectIntervalMs"];
	        this.wsMaxMessageSizeMb = source["wsMaxMessageSizeMb"];
	        this.wsKeepAliveIntervalMs = source["wsKeepAliveIntervalMs"];
	        this.sioClientVersion = source["sioClientVersion"];
	        this.sioPath = source["sioPath"];
	        this.sioNamespace = source["sioNamespace"];
	        this.sioListenEvents = source["sioListenEvents"];
	        this.sseDisableReconnect = source["sseDisableReconnect"];
	        this.sseReconnectIntervalMs = source["sseReconnectIntervalMs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TimelineEvent {
	    label: string;
	    atMs: number;
	    detail?: string;
	
	    static createFrom(source: any = {}) {
	        return new TimelineEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.atMs = source["atMs"];
	        this.detail = source["detail"];
	    }
	}
	export class SentRequest {
	    method: string;
	    url: string;
	    proto: string;
	    headers: KeyValue[];
	
	    static createFrom(source: any = {}) {
	        return new SentRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.method = source["method"];
	        this.url = source["url"];
	        this.proto = source["proto"];
	        this.headers = this.convertValues(source["headers"], KeyValue);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ResponseTime {
	    total: number;
	    prepare: number;
	    socketInitialization: number;
	    dnsLookup: number;
	    tcpHandshake: number;
	    tlsHandshake: number;
	    waitingTTFB: number;
	    download: number;
	    process: number;
	
	    static createFrom(source: any = {}) {
	        return new ResponseTime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.prepare = source["prepare"];
	        this.socketInitialization = source["socketInitialization"];
	        this.dnsLookup = source["dnsLookup"];
	        this.tcpHandshake = source["tcpHandshake"];
	        this.tlsHandshake = source["tlsHandshake"];
	        this.waitingTTFB = source["waitingTTFB"];
	        this.download = source["download"];
	        this.process = source["process"];
	    }
	}
	export class HttpResponse {
	    statusCode: number;
	    status: string;
	    headers: KeyValue[];
	    body: string;
	    duration: number;
	    timings: ResponseTime;
	    size: number;
	    error?: string;
	    preRequestResult: ScriptResult;
	    testResult: ScriptResult;
	    sentRequests?: SentRequest[];
	    connection: ConnectionInfo;
	    timeline?: TimelineEvent[];
	    skipped?: boolean;
	    skipReason?: string;
	    previewImageBase64?: string;
	    previewMediaType?: string;
	    bodyIsBinary?: boolean;
	    bodySniffedType?: string;
	    collectionVariableUpdates?: Record<string, string>;
	    collectionVariablesRemoved?: string[];
	
	    static createFrom(source: any = {}) {
	        return new HttpResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statusCode = source["statusCode"];
	        this.status = source["status"];
	        this.headers = this.convertValues(source["headers"], KeyValue);
	        this.body = source["body"];
	        this.duration = source["duration"];
	        this.timings = this.convertValues(source["timings"], ResponseTime);
	        this.size = source["size"];
	        this.error = source["error"];
	        this.preRequestResult = this.convertValues(source["preRequestResult"], ScriptResult);
	        this.testResult = this.convertValues(source["testResult"], ScriptResult);
	        this.sentRequests = this.convertValues(source["sentRequests"], SentRequest);
	        this.connection = this.convertValues(source["connection"], ConnectionInfo);
	        this.timeline = this.convertValues(source["timeline"], TimelineEvent);
	        this.skipped = source["skipped"];
	        this.skipReason = source["skipReason"];
	        this.previewImageBase64 = source["previewImageBase64"];
	        this.previewMediaType = source["previewMediaType"];
	        this.bodyIsBinary = source["bodyIsBinary"];
	        this.bodySniffedType = source["bodySniffedType"];
	        this.collectionVariableUpdates = source["collectionVariableUpdates"];
	        this.collectionVariablesRemoved = source["collectionVariablesRemoved"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class OAuth2TokenResponse {
	    access_token: string;
	    token_type: string;
	    expires_in: number;
	    refresh_token?: string;
	    scope?: string;
	    id_token?: string;
	    error?: string;
	    error_description?: string;
	
	    static createFrom(source: any = {}) {
	        return new OAuth2TokenResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.access_token = source["access_token"];
	        this.token_type = source["token_type"];
	        this.expires_in = source["expires_in"];
	        this.refresh_token = source["refresh_token"];
	        this.scope = source["scope"];
	        this.id_token = source["id_token"];
	        this.error = source["error"];
	        this.error_description = source["error_description"];
	    }
	}
	
	
	
	export class SocketIOEmitMessage {
	    eventName: string;
	    args: string[];
	    namespace: string;
	    ack: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SocketIOEmitMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.eventName = source["eventName"];
	        this.args = source["args"];
	        this.namespace = source["namespace"];
	        this.ack = source["ack"];
	    }
	}
	export class SocketIOEmitResult {
	    ok: boolean;
	    ackId?: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SocketIOEmitResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.ackId = source["ackId"];
	        this.error = source["error"];
	    }
	}
	
	
	export class UpdateInfo {
	    version: string;
	    releaseNotes: string;
	    publishedAt: string;
	    downloadUrl: string;
	    assetName: string;
	    sha256: string;
	    signatureUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.releaseNotes = source["releaseNotes"];
	        this.publishedAt = source["publishedAt"];
	        this.downloadUrl = source["downloadUrl"];
	        this.assetName = source["assetName"];
	        this.sha256 = source["sha256"];
	        this.signatureUrl = source["signatureUrl"];
	    }
	}
	export class UpdateCheckResult {
	    info?: UpdateInfo;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.info = this.convertValues(source["info"], UpdateInfo);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WebSocketSendMessage {
	    type: string;
	    data: string;
	    encoding?: string;
	    code?: number;
	
	    static createFrom(source: any = {}) {
	        return new WebSocketSendMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.data = source["data"];
	        this.encoding = source["encoding"];
	        this.code = source["code"];
	    }
	}
	export class WebSocketSendResult {
	    ok: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new WebSocketSendResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	    }
	}

}

