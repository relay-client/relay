import type { GrpcRequest, HttpRequest } from '../../backend';
import {
  collectionSecretVariableKeys,
  collectionSecretVariableValues,
  collectionVariableValues,
  valuesWithBrunoPriority,
} from '../../collectionDefaults';
import { serializeGraphQLPayload, type GraphQLPayload } from '../../graphql';
import { resolveProxy, type ResolvedProxy } from '../../proxy';
import { flattenUrlParams } from '../../queryParams';
import { DEFAULT_GRPC_MESSAGE } from '../../requestBodyDefaults';
import type {
  Collection,
  BodyType,
  KVRow,
  ProxyConfig,
  RequestType,
  SavedRequest,
  ScriptEngine,
} from '../../types/models';

const RAW_BODY_TYPES = ['text', 'json', 'html', 'xml'] as const;

type RequestSerializationHost = {
  proxyConfig: ProxyConfig;
  activeWorkspaceId: string;
  activeEnvironmentValues: () => Record<string, string>;
  activeSecretEnvironmentKeys: () => string[];
  activeSecretEnvironmentValues: () => string[];
  collectionForRequest: (req: Pick<SavedRequest, 'collectionId'>) => Collection | undefined;
  environmentValuesForRequest: (req: Pick<SavedRequest, 'collectionId'>, envValues?: Record<string, string>) => Record<string, string>;
  graphQLBodyForSend: (payload: GraphQLPayload) => string;
  graphQLPayloadFromRequest: (req: Pick<SavedRequest, 'bodyContent'>) => GraphQLPayload;
  normalizeRequestTypeValue: (value: unknown, url?: string) => RequestType;
  normalizeRequestUrlForSend: (rawUrl: string) => string;
  normalizeWebSocketUrlForSend: (rawUrl: string) => string;
  requestWithCollectionDefaults: (req: SavedRequest) => SavedRequest;
  resolveProxyFields: (overrideUrl: string) => ResolvedProxy;
  resolveRows: (rows: KVRow[], values?: Record<string, string>) => KVRow[];
  resolveTemplate: (value: string, values?: Record<string, string>) => string;
  stripBodyComments: (source: string, type: BodyType) => string;
  savedRequestToRunnableHttpRequest: (
    req: SavedRequest,
    envValues?: Record<string, string>,
    secretEnvironmentValues?: string[],
    secretEnvironmentKeys?: string[],
    requestId?: string,
  ) => HttpRequest;
  scriptFieldsForSend: (req: SavedRequest) => { preRequestScript: string; testScript: string; scriptEngine: ScriptEngine };
  secretEnvironmentKeysForRequest: (req: Pick<SavedRequest, 'collectionId'>, secretKeys?: string[]) => string[];
  secretEnvironmentValuesForRequest: (req: Pick<SavedRequest, 'collectionId'>, secretValues?: string[]) => string[];
};

export const requestSerializationFeature = {
  environmentValuesForRequest(
    this: RequestSerializationHost,
    req: Pick<SavedRequest, 'collectionId'>,
    envValues = this.activeEnvironmentValues(),
  ) {
    return valuesWithBrunoPriority(this.collectionForRequest(req), envValues);
  },

  secretEnvironmentKeysForRequest(
    this: RequestSerializationHost,
    req: Pick<SavedRequest, 'collectionId'>,
    secretKeys = this.activeSecretEnvironmentKeys(),
  ) {
    return [...new Set([...collectionSecretVariableKeys(this.collectionForRequest(req)), ...secretKeys])];
  },

  secretEnvironmentValuesForRequest(
    this: RequestSerializationHost,
    req: Pick<SavedRequest, 'collectionId'>,
    secretValues = this.activeSecretEnvironmentValues(),
  ) {
    return [...new Set([...collectionSecretVariableValues(this.collectionForRequest(req)), ...secretValues])];
  },

  resolveProxyFields(this: RequestSerializationHost, overrideUrl: string) {
    return resolveProxy(this.proxyConfig, overrideUrl);
  },

  savedRequestToHttpRequest(this: RequestSerializationHost, req: SavedRequest): HttpRequest {
    req = this.requestWithCollectionDefaults(req);
    const isGraphQL = this.normalizeRequestTypeValue(req.requestType, req.url) === 'graphql' || req.bodyType === 'graphql';
    const graphql = isGraphQL ? this.graphQLPayloadFromRequest(req) : null;
    const flat = this.normalizeRequestTypeValue(req.requestType, req.url) === 'grpc'
      ? { url: req.url, params: req.params }
      : flattenUrlParams(req.url, req.params);
    let body = bodyContentForSend(this, req);
    if (graphql) {
      try { body = this.graphQLBodyForSend(graphql); }
      catch { body = serializeGraphQLPayload(graphql); }
    }
    return { workspaceId: this.activeWorkspaceId, method: isGraphQL ? 'POST' : req.method, url: flat.url, params: flat.params.map(({ key, value, enabled }) => ({ key, value, enabled, isFile: false, fileName: '' })), headers: req.headers.map(({ key, value, enabled }) => ({ key, value, enabled, isFile: false, fileName: '' })), auth: { type: req.auth.type, token: req.auth.type === 'oauth2' ? req.auth.oauth2Token : req.auth.bearerToken, username: req.auth.basicUser, password: req.auth.basicPass, keyName: req.auth.apiKeyName, keyValue: req.auth.apiKeyValue, keyIn: req.auth.apiKeyIn, oauth2GrantType: req.auth.oauth2GrantType, oauth2AuthURL: req.auth.oauth2AuthURL, oauth2TokenURL: req.auth.oauth2TokenURL, oauth2ClientID: req.auth.oauth2ClientID, oauth2Secret: req.auth.oauth2Secret, oauth2Scope: req.auth.oauth2Scope, oauth2UsePKCE: req.auth.oauth2UsePKCE, oauth2RefreshToken: req.auth.oauth2RefreshToken, awsAccessKey: req.auth.awsAccessKey, awsSecretKey: req.auth.awsSecretKey, awsRegion: req.auth.awsRegion, awsService: req.auth.awsService }, bodyType: isGraphQL ? 'graphql' : req.bodyType, body, bodyFilePath: req.bodyFilePath, formData: req.formRows.map(({ key, value, enabled, isFile, fileName }) => ({ key, value, enabled, isFile: isFile ?? false, fileName: fileName ?? '' })), ...this.scriptFieldsForSend(req), followRedirects: req.settings.followRedirects, timeoutMs: req.settings.timeoutMs, httpVersion: req.settings.httpVersion, enableSSLVerification: req.settings.enableSSLVerification, followOriginalMethod: req.settings.followOriginalMethod, followAuthorizationHeader: req.settings.followAuthorizationHeader, removeRefererHeader: req.settings.removeRefererHeader, encodeUrlAutomatically: req.settings.encodeUrlAutomatically, disableCookieJar: req.settings.disableCookieJar, maxRedirects: req.settings.maxRedirects, ...this.resolveProxyFields(req.settings.proxyUrl ?? ''), browserEmulation: req.settings.browserEmulation, browserOrigin: req.settings.browserOrigin, browserWithCredentials: req.settings.browserWithCredentials, browserEnforceCORS: req.settings.browserEnforceCORS, browserEnforceCSP: req.settings.browserEnforceCSP, browserCSP: req.settings.browserCSP, wsHandshakeTimeoutMs: req.settings.wsHandshakeTimeoutMs, wsReconnectAttempts: req.settings.wsReconnectAttempts, wsReconnectIntervalMs: req.settings.wsReconnectIntervalMs, wsMaxMessageSizeMb: req.settings.wsMaxMessageSizeMb };
  },

  savedRequestToRunnableHttpRequest(
    this: RequestSerializationHost,
    req: SavedRequest,
    envValues = this.activeEnvironmentValues(),
    secretEnvironmentValues = this.activeSecretEnvironmentValues(),
    secretEnvironmentKeys = this.activeSecretEnvironmentKeys(),
    requestId = req.id,
  ): HttpRequest {
    req = this.requestWithCollectionDefaults(req);
    envValues = this.environmentValuesForRequest(req, envValues);
    secretEnvironmentValues = this.secretEnvironmentValuesForRequest(req, secretEnvironmentValues);
    secretEnvironmentKeys = this.secretEnvironmentKeysForRequest(req, secretEnvironmentKeys);
    const isGraphQL = this.normalizeRequestTypeValue(req.requestType, req.url) === 'graphql' || req.bodyType === 'graphql';
    const rawBody = bodyContentForSend(this, req);
    const outBody = isGraphQL
      ? this.graphQLBodyForSend({
          query: this.resolveTemplate(this.graphQLPayloadFromRequest(req).query, envValues),
          variables: this.resolveTemplate(this.graphQLPayloadFromRequest(req).variables, envValues),
          operationName: this.resolveTemplate(this.graphQLPayloadFromRequest(req).operationName, envValues),
        })
      : this.resolveTemplate(rawBody, envValues);
    const outBodyType = (isRawBodyType(req.bodyType) || req.bodyType === 'graphql') && !outBody.trim() ? 'none' : req.bodyType;
    const normalizedRequestType = this.normalizeRequestTypeValue(req.requestType, req.url);
    const flat = flattenUrlParams(req.url.trim(), req.params);
    const resolvedUrl = this.resolveTemplate(flat.url, envValues);
    return {
      workspaceId: this.activeWorkspaceId,
      method: isGraphQL ? 'POST' : req.method,
      url: normalizedRequestType === 'ws' || normalizedRequestType === 'socketio'
        ? this.normalizeWebSocketUrlForSend(resolvedUrl)
        : this.normalizeRequestUrlForSend(resolvedUrl),
      params: this.resolveRows(flat.params, envValues).filter(r => r.enabled && r.key).map(({ key, value, enabled }) => ({ key, value, enabled, isFile: false, fileName: '' })),
      headers: this.resolveRows(req.headers, envValues).filter(r => r.enabled && r.key).map(({ key, value, enabled }) => ({ key, value, enabled, isFile: false, fileName: '' })),
      auth: {
        type: req.auth.type,
        token: this.resolveTemplate(req.auth.type === 'oauth2' ? req.auth.oauth2Token : req.auth.bearerToken, envValues),
        username: this.resolveTemplate(req.auth.basicUser, envValues),
        password: this.resolveTemplate(req.auth.basicPass, envValues),
        keyName: this.resolveTemplate(req.auth.apiKeyName, envValues),
        keyValue: this.resolveTemplate(req.auth.apiKeyValue, envValues),
        keyIn: req.auth.apiKeyIn,
        oauth2GrantType: req.auth.oauth2GrantType,
        oauth2AuthURL: this.resolveTemplate(req.auth.oauth2AuthURL ?? '', envValues),
        oauth2TokenURL: this.resolveTemplate(req.auth.oauth2TokenURL, envValues),
        oauth2ClientID: this.resolveTemplate(req.auth.oauth2ClientID, envValues),
        oauth2Secret: this.resolveTemplate(req.auth.oauth2Secret, envValues),
        oauth2Scope: this.resolveTemplate(req.auth.oauth2Scope, envValues),
        oauth2UsePKCE: req.auth.oauth2UsePKCE,
        oauth2RefreshToken: this.resolveTemplate(req.auth.oauth2RefreshToken ?? '', envValues),
        awsAccessKey: this.resolveTemplate(req.auth.awsAccessKey, envValues),
        awsSecretKey: this.resolveTemplate(req.auth.awsSecretKey, envValues),
        awsRegion: this.resolveTemplate(req.auth.awsRegion, envValues),
        awsService: this.resolveTemplate(req.auth.awsService, envValues),
      },
      bodyType: isGraphQL ? 'graphql' : outBodyType,
      body: outBody,
      bodyFilePath: this.resolveTemplate(req.bodyFilePath, envValues),
      formData: this.resolveRows(req.formRows, envValues).filter(r => r.enabled && r.key).map(({ key, value, enabled, isFile, fileName }) => ({ key, value, enabled, isFile: isFile ?? false, fileName: fileName ?? '' })),
      ...this.scriptFieldsForSend(req),
      followRedirects: req.settings.followRedirects,
      timeoutMs: req.settings.timeoutMs,
      httpVersion: req.settings.httpVersion,
      enableSSLVerification: req.settings.enableSSLVerification,
      followOriginalMethod: req.settings.followOriginalMethod,
      followAuthorizationHeader: req.settings.followAuthorizationHeader,
      removeRefererHeader: req.settings.removeRefererHeader,
      encodeUrlAutomatically: req.settings.encodeUrlAutomatically,
      disableCookieJar: req.settings.disableCookieJar,
      maxRedirects: req.settings.maxRedirects,
      ...this.resolveProxyFields(req.settings.proxyUrl ?? ''),
      browserEmulation: req.settings.browserEmulation,
      browserOrigin: req.settings.browserOrigin,
      browserWithCredentials: req.settings.browserWithCredentials,
      browserEnforceCORS: req.settings.browserEnforceCORS,
      browserEnforceCSP: req.settings.browserEnforceCSP,
      browserCSP: req.settings.browserCSP,
      wsHandshakeTimeoutMs: req.settings.wsHandshakeTimeoutMs,
      wsReconnectAttempts: req.settings.wsReconnectAttempts,
      wsReconnectIntervalMs: req.settings.wsReconnectIntervalMs,
      wsMaxMessageSizeMb: req.settings.wsMaxMessageSizeMb,
      sioClientVersion: req.settings.sioClientVersion,
      sioPath: req.settings.sioPath,
      sioNamespace: req.settings.sioNamespace,
      sioListenEvents: (req.sioEvents ?? []).filter(r => r.enabled && r.key.trim()).map(r => r.key.trim()),
      collectionVariables: collectionVariableValues(this.collectionForRequest(req)),
      requestId,
      secretEnvironmentKeys,
      secretEnvironmentValues,
    };
  },

  savedRequestToRunnableGrpcRequest(
    this: RequestSerializationHost,
    req: SavedRequest,
    envValues = this.activeEnvironmentValues(),
    secretEnvironmentValues = this.activeSecretEnvironmentValues(),
    secretEnvironmentKeys = this.activeSecretEnvironmentKeys(),
    requestId = req.id,
  ): GrpcRequest {
    req = this.requestWithCollectionDefaults(req);
    envValues = this.environmentValuesForRequest(req, envValues);
    secretEnvironmentValues = this.secretEnvironmentValuesForRequest(req, secretEnvironmentValues);
    secretEnvironmentKeys = this.secretEnvironmentKeysForRequest(req, secretEnvironmentKeys);
    const auth = req.auth;
    return {
      requestId,
      target: this.resolveTemplate(req.url.trim(), envValues),
      fullMethod: this.resolveTemplate(req.grpcMethod ?? '', envValues),
      message: this.resolveTemplate(req.bodyContent || DEFAULT_GRPC_MESSAGE, envValues),
      metadata: this.resolveRows(req.grpcMetadata ?? [], envValues).filter(r => r.enabled && r.key).map(({ key, value, enabled }) => ({ key, value, enabled, isFile: false, fileName: '' })),
      auth: {
        type: auth.type === 'inherit' ? 'none' : auth.type,
        token: this.resolveTemplate(auth.type === 'oauth2' ? auth.oauth2Token : auth.bearerToken, envValues),
        username: this.resolveTemplate(auth.basicUser, envValues),
        password: this.resolveTemplate(auth.basicPass, envValues),
        keyName: this.resolveTemplate(auth.apiKeyName, envValues),
        keyValue: this.resolveTemplate(auth.apiKeyValue, envValues),
        keyIn: 'header',
        oauth2GrantType: auth.oauth2GrantType,
        oauth2AuthURL: this.resolveTemplate(auth.oauth2AuthURL ?? '', envValues),
        oauth2TokenURL: this.resolveTemplate(auth.oauth2TokenURL, envValues),
        oauth2ClientID: this.resolveTemplate(auth.oauth2ClientID, envValues),
        oauth2Secret: this.resolveTemplate(auth.oauth2Secret, envValues),
        oauth2Scope: this.resolveTemplate(auth.oauth2Scope, envValues),
        oauth2UsePKCE: auth.oauth2UsePKCE,
        oauth2RefreshToken: this.resolveTemplate(auth.oauth2RefreshToken ?? '', envValues),
        awsAccessKey: '',
        awsSecretKey: '',
        awsRegion: '',
        awsService: '',
      },
      useReflection: req.settings.grpcUseReflection ?? req.grpcUseReflection ?? true,
      protoFilePath: this.resolveTemplate(req.grpcProtoFilePath ?? '', envValues),
      protoImportPaths: (req.grpcProtoImportPaths ?? []).map(path => this.resolveTemplate(path, envValues)).filter(Boolean),
      useTls: req.settings.grpcUseTls,
      enableSSLVerification: req.settings.enableSSLVerification,
      serverName: this.resolveTemplate(req.settings.grpcServerName, envValues),
      includeDefaultValues: req.settings.grpcIncludeDefaultValues,
      maxResponseMessageSizeMb: req.settings.grpcMaxResponseMessageSizeMb,
      timeoutMs: req.settings.timeoutMs,
      ...this.scriptFieldsForSend(req),
      collectionVariables: collectionVariableValues(this.collectionForRequest(req)),
      secretEnvironmentKeys,
      secretEnvironmentValues,
    };
  },

  normalizeRequestUrlForSend(rawUrl: string) {
    const v = rawUrl.trim(); if (!v || v.startsWith('{{')) return v;
    if (v.startsWith('//')) return `http:${v}`; if (!v.includes('://')) return `http://${v}`; return v;
  },

  normalizeWebSocketUrlForSend(rawUrl: string) {
    const v = rawUrl.trim(); if (!v || v.startsWith('{{')) return v;
    if (v.startsWith('//')) return `ws:${v}`;
    if (!v.includes('://')) return `ws://${v}`;
    if (/^http:\/\//i.test(v)) return v.replace(/^http/i, 'ws');
    return v;
  },
};

function isRawBodyType(type: string): type is (typeof RAW_BODY_TYPES)[number] {
  return (RAW_BODY_TYPES as readonly string[]).includes(type);
}

function bodyContentForSend(host: RequestSerializationHost, req: SavedRequest): string {
  return isRawBodyType(req.bodyType) ? host.stripBodyComments(req.bodyContent, req.bodyType) : req.bodyContent;
}
