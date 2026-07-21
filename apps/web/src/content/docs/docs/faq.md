---
title: FAQ
description: Common questions about Relay — data, auth, updates, troubleshooting.
---

## Is Relay free?

Yes. Relay is free to use on macOS, Windows, and Linux. The source for the desktop application is currently closed; release binaries and update metadata are published to a public repository so the auto-updater works without embedding tokens. See [building from source](https://github.com/relay-client/relay#building-from-source) if you have access.

## Is my data sent anywhere?

Relay is local-first: requests, collections, history, environments, and secrets live on disk. There is no account system, Relay cloud sync, analytics, or telemetry.

Network traffic still occurs for actions that inherently need it: requests and realtime connections you start, OAuth authorization/token calls, GraphQL introspection, Git fetch/pull/push/clone operations, and release update checks.

## Where is my data stored?

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Relay/` |
| Windows | `%APPDATA%\Relay\` |
| Linux | `~/.config/Relay/` |

The local profile is an AES-256-GCM encrypted JSON envelope stored as `requests.json`, not SQLite. Relay also writes `request-store.key` as a `0600` recovery copy of the encryption key. Where available, the same key is additionally stored in macOS Keychain, Windows DPAPI, or Linux libsecret.

Folder/Git workspace YAML is intentionally readable so it can be reviewed and committed. Sensitive values are replaced by `{{relaySecret:...}}` placeholders and retained in the encrypted local profile.

## How do I export and back up my data?

Use **Settings -> General -> Advanced data -> Export all data** for a portable Relay backup. It includes profile data, history, cookies, and selected preferences; it is also a plaintext file that can contain secrets. Collection exports are for interoperability and do not include runtime history or cookies.

For an exact disk-level backup, quit Relay and copy the data directory with both `requests.json` and its matching `request-store.key`. Back up external workspace repositories separately.

See [Backup & recovery](/docs/guides/backup-recovery/) for contents, exclusions, migration, and destructive restore behavior.

## macOS says "the app can't be opened"

If macOS reports the app is damaged after download, the file likely got the quarantine attribute from a non-standard download path. Run:

```sh
xattr -d com.apple.quarantine /Applications/Relay.app
```

If that doesn't help, redownload from the [official releases page](https://github.com/relay-client/relay/releases/latest) and compare its SHA-256 checksum.

## Windows SmartScreen warns about the installer

The NSIS installer is not currently Authenticode-signed, so SmartScreen may flag it. Confirm that it came from the official releases page, verify its checksum, then use **More info → Run anyway** only if you trust the download.

## Auto-updates aren't working

- Check manually from **Settings → Updates**.
- If you want background installation, enable **Settings → About → Automatically install updates**.
- Make sure `https://github.com/relay-client/relay/releases/latest/download/latest.json` is reachable — corporate proxies sometimes block GitHub release downloads.
- If you're on an unreleased dev build, auto-update is disabled by design.

## Postman compatibility — what doesn't carry over?

See [Import & export](/docs/guides/import-export/). Short version: common `pm.*` scripts import into Relay's sandboxed script fields, but anything requiring Node.js modules, external packages, Visualizers, or cloud-only Postman features needs a rewrite. Monitors and Mock Servers are not supported.

## Roadmap?

Tracked as GitHub issues with the `roadmap` label. Current gaps include SOAP/XML-specific auth, deeper runner automation, a plugin API, and more interoperability formats.

## How do I report a bug?

[Open an issue](https://github.com/relay-client/relay/issues) with:

- Version (Help → About → copy).
- Platform and OS version.
- Steps to reproduce.
- Anonymized request if relevant (strip auth + sensitive bodies).
