---
title: Relay YAML format
description: Public contract for Git-backed Relay workspaces.
---

Relay stores Git-backed workspaces as plain YAML files. The contract below is intended for review tools, formatters, generators, and import/export integrations.

Schema: `schemas/relay-workspace-yaml-v1.schema.json`

## Contract

| Field | Value |
|-------|-------|
| Storage kind | `workspace-yaml` |
| Format | `relay.workspace.yaml.v1` |
| File version | `1` |
| Path layout | `yaml-filesystem-names.v1` |
| Encoding | UTF-8 YAML |

Relay preserves unknown fields inside workspace, collection, request, environment, auth, settings, and row objects when it can. Tools should do the same to stay forward-compatible.

## Directory layout

```text
relay.yml
workspaces/
  <workspace filesystemName>/
    workspace.yml
    collections/
      <collection filesystemName>/
        collection.yml
        requests/
          <request filesystemName>.yml
    environments/
      <environment filesystemName>.yml
```

`filesystemName` is the stable path segment for every public object. It must be present in YAML files and must not contain `/` or `\`. Relay derives it from the item name when creating new items, but once written it is treated as the Git-stable filename.

Request and environment files may include a top-level `order` for older exports. Newer writers should prefer `requestOrder`, `collectionOrder`, and `workspaceOrder`; readers must tolerate files without `order`.

## Root index

`relay.yml` identifies the shared workspace store and records workspace order.

```yaml
version: 1
format: relay.workspace.yaml.v1
workspaceOrder:
  - workspace-main
```

## Workspace file

Path: `workspaces/<workspace filesystemName>/workspace.yml`

```yaml
version: 1
workspace:
  id: workspace-main
  name: Main
  filesystemName: Main
  description: ""
  createdAt: 1710000000000
  updatedAt: 1710000000000
collectionOrder:
  - collection-core
```

## Collection file

Path: `workspaces/<workspace>/collections/<collection filesystemName>/collection.yml`

```yaml
version: 1
collection:
  id: collection-core
  workspaceId: workspace-main
  name: Core API
  filesystemName: Core-API
  description: ""
  collapsed: false
  folderPaths:
    - - Auth
    - - Auth
      - Admin
  createdAt: 1710000000000
  updatedAt: 1710000000000
requestOrder:
  - req-login
```

`collection.folderPaths` preserves explicit folders, including empty folders. Request files stay flat under `requests/`; the UI hierarchy comes from `request.folderPath` and `collection.folderPaths`, not from nested filesystem directories.

## Request file

Path: `workspaces/<workspace>/collections/<collection>/requests/<request filesystemName>.yml`

```yaml
version: 1
request:
  id: req-login
  name: Login
  filesystemName: Login
  requestType: http
  isPinned: false
  collectionId: collection-core
  folderPath:
    - Auth
  method: POST
  url: "{{baseUrl}}/login"
  requestTab: body
  params: []
  headers:
    - id: 1
      enabled: true
      key: Content-Type
      value: application/json
      description: ""
  auth:
    type: bearer
    bearerToken: "{{relaySecret:request:req-login:auth:bearerToken}}"
    basicUser: ""
    basicPass: ""
    apiKeyName: X-API-Key
    apiKeyValue: ""
    apiKeyIn: header
    oauth2GrantType: client_credentials
    oauth2AuthURL: ""
    oauth2TokenURL: ""
    oauth2ClientID: ""
    oauth2Secret: ""
    oauth2Scope: ""
    oauth2Token: ""
    oauth2RefreshToken: ""
    oauth2TokenExpiry: 0
    oauth2UsePKCE: true
    awsAccessKey: ""
    awsSecretKey: ""
    awsRegion: us-east-1
    awsService: execute-api
  bodyType: json
  rawBodyType: json
  bodyContent: |-
    {"username":"ada"}
  bodyFilePath: ""
  bodyFileName: ""
  formRows: []
  graphqlSchema: ""
  preRequestScript: ""
  preRequestScriptJs: ""
  testScript: ""
  testScriptJs: ""
  requestNotes: ""
  settings:
    httpVersion: auto
    enableSSLVerification: true
    followRedirects: true
    followOriginalMethod: false
    followAuthorizationHeader: false
    removeRefererHeader: false
    encodeUrlAutomatically: true
    disableCookieJar: false
    maxRedirects: 10
    timeoutMs: 30000
    proxyUrl: ""
    browserEmulation: false
    browserOrigin: ""
    browserWithCredentials: false
    browserEnforceCORS: false
    browserEnforceCSP: false
    browserCSP: ""
    wsHandshakeTimeoutMs: 0
    wsReconnectAttempts: 0
    wsReconnectIntervalMs: 5000
    wsMaxMessageSizeMb: 10
    sioClientVersion: v3
    sioPath: /socket.io
    sioNamespace: /
    grpcUseTls: false
    grpcUseReflection: true
    grpcServerName: ""
    grpcIncludeDefaultValues: true
    grpcMaxResponseMessageSizeMb: 10
  settingsOverrides: {}
  grpcMethod: ""
  grpcMetadata: []
  grpcUseReflection: true
  grpcProtoFilePath: ""
  grpcProtoFileName: ""
  grpcProtoImportPaths: []
  createdAt: 1710000000000
  updatedAt: 1710000000000
```

### Request fields

| Field | Contract |
|-------|----------|
| `requestType` | `http`, `graphql`, `ws`, `socketio`, or `grpc` |
| `method` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, or `SSE` |
| `folderPath` | Display names only. Request files are stored flat; `folderPath` is the UI source of truth. |
| `params`, `headers`, `formRows`, `sioEvents`, `grpcMetadata` | Arrays of row objects: `id`, `enabled`, `key`, `value`, `description`, optional `secret`, `isFile`, `fileName`. |
| `grpcMethod`, `grpcUseReflection`, `grpcProtoFilePath`, `grpcProtoFileName`, `grpcProtoImportPaths` | gRPC method and service-definition source metadata. |
| `bodyType` | `none`, `json`, `text`, `xml`, `html`, `form`, `urlencoded`, `binary`, or `graphql`. |
| `rawBodyType` | `text`, `json`, `html`, or `xml`. |
| `preRequestScript`, `testScript` | Legacy Tengo scripts. |
| `preRequestScriptJs`, `testScriptJs` | JavaScript pre-request/test scripts. |
| `auth.type` | `none`, `bearer`, `basic`, `apikey`, `oauth2`, `aws`, or `digest`. |
| `auth.oauth2GrantType`, `auth.oauth2AuthURL`, `auth.oauth2TokenURL`, `auth.oauth2ClientID`, `auth.oauth2Scope`, `auth.oauth2TokenExpiry`, `auth.oauth2UsePKCE` | OAuth 2.0 grant metadata. `oauth2GrantType` is `client_credentials` or `authorization_code`; Authorization Code can use PKCE. |
| `settings` | Request transport settings. Unknown settings must be preserved by third-party tools. |
| `settingsOverrides` | Per-request override markers for inherited collection defaults. |

Secret-bearing auth fields (`bearerToken`, `basicPass`, `apiKeyValue`, `oauth2Secret`, `oauth2Token`, `oauth2RefreshToken`, `awsAccessKey`, and `awsSecretKey`) are replaced with `{{relaySecret:...}}` placeholders in shared Git/YAML workspaces. Their plaintext values stay in Relay's encrypted local profile.

## Environment file

Path: `workspaces/<workspace>/environments/<environment filesystemName>.yml`

```yaml
version: 1
environment:
  id: environment-local
  workspaceId: workspace-main
  name: Local
  filesystemName: Local
  values:
    - id: 1
      enabled: true
      key: baseUrl
      value: https://api.example.test
      description: ""
    - id: 2
      enabled: true
      key: token
      value: "{{relaySecret:environment:environment-local:row:2}}"
      description: ""
      secret: true
  createdAt: 1710000000000
  updatedAt: 1710000000000
```

## Secrets

Shared YAML files may contain placeholders in sensitive request auth fields and in rows marked `secret: true`.

```text
{{relaySecret:<stable key>}}
```

Relay stores the actual values in its encrypted local `requests.json` profile. They are not part of the workspace directory or this shared public contract.

Secret-aware tools should preserve placeholders as-is. If a tool cannot resolve a placeholder, it should keep the placeholder instead of replacing it with an empty string.

## Git behavior

Relay treats these paths as managed Git content:

- `relay.yml`
- `.gitignore`
- `workspaces/**/*.yml`

Other files in the repository are intentionally left alone by commit, discard, stash, and conflict-resolution operations unless Relay explicitly adds support for them in a future format version.
