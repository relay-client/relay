# @kurlo/cli

The command line of [Kurlo](https://kurlo.dev), a free, open-source desktop API client. It runs the requests and test scripts of a Kurlo workspace, and serves a workspace to AI agents as an MCP server. You don't need the desktop app installed to use it.

```bash
npm install -g @kurlo/cli
kurlo --version
```

## Connect an AI agent

Claude Code:

```bash
claude mcp add kurlo -- npx -y @kurlo/cli mcp --env Staging
```

Codex:

```bash
codex mcp add kurlo -- npx -y @kurlo/cli mcp --env Staging
```

Cursor, Claude Desktop and other clients with a JSON config:

```json
{
  "mcpServers": {
    "kurlo": {
      "command": "npx",
      "args": ["-y", "@kurlo/cli", "mcp", "--env", "Staging"]
    }
  }
}
```

The agent can list your requests and environments, run a saved request or a whole collection with its tests, and send one-off calls that use your `{{variables}}`. Secret values are sent to your API and masked as `[secret]` in everything the model sees.

With no workspace argument, `kurlo mcp` serves the workspace the desktop app has open. Pass the folder that contains `kurlo.yml` to serve a Git-backed workspace instead:

```bash
npx -y @kurlo/cli mcp ./api --env Staging
```

## Run collections in CI

```bash
npx -y @kurlo/cli run ./api --env CI --reporters cli,junit
```

The run exits non-zero when a request fails or a test does not pass.

## Docs

- [MCP server](https://kurlo.dev/docs/guides/mcp-server/)
- [CLI runner](https://kurlo.dev/docs/guides/cli-runner/)
- [Git-backed workspaces](https://kurlo.dev/docs/guides/git-workspaces/)

Prebuilt binaries are published for macOS, Linux and Windows on x64 and arm64. MIT licensed.
