---
title: Installation
description: Install Relay on macOS, Windows, or Linux.
---

Relay publishes release artifacts for each supported platform on the [releases page](https://github.com/relay-client/relay/releases/latest). Code-signing status differs by platform and artifact, so follow the first-run notes below.

## macOS

**Requirements:** macOS 11 (Big Sur) or later. Apple Silicon and Intel are both supported.

1. Download `relay-<version>-darwin-universal.dmg`.
2. Open the DMG, drag **Relay.app** to `/Applications`.
3. Launch from Spotlight or the Applications folder.

Current DMGs are not Apple-notarized. On first launch, right-click **Relay.app** and choose **Open**, or use *System Settings → Privacy & Security → Open Anyway*. See the [troubleshooting guide](/docs/troubleshooting/#macos-relay-cant-be-opened-because-apple-cannot-check-it-for-malicious-software).

## Windows

**Requirements:** Windows 10 1903+ or Windows 11. x64 only.

You have two options:

- **NSIS installer** (`relay-<version>-windows-amd64-installer.exe`) — classic Windows installer. SmartScreen may warn because this artifact is not currently Authenticode-signed.
- **MSIX package** (`relay-<version>-windows-amd64.msix`) — packaged Windows install. Release automation signs it only when the release job is supplied with the configured publisher certificate; an unsigned package cannot be installed without additional trust setup.

## Linux

**Requirements:** glibc 2.31+ (Ubuntu 20.04+, Fedora 33+, Debian 11+). x64 only.

Download `relay-<version>-linux-amd64.AppImage`, make it executable, and run:

```sh
chmod +x relay-*.AppImage
./relay-*.AppImage
```

You'll need `libgtk-3` and `libwebkit2gtk-4.0` from your distro's package manager.

## Verify the download

SHA256 checksums are published in `SHA256SUMS.txt`; auto-updates use the values embedded in `latest.json`. Verify before running:

```sh
shasum -a 256 relay-*.dmg
# Compare against the value on the releases page.
```

## Auto-updates

Relay checks `latest.json` from `relay-client/relay` after launch. Open **Settings → Updates** to check and install manually. **Settings → About → Automatically install updates** controls whether a discovered update is installed in the background.

Updater binaries are verified against both the SHA-256 value and minisign signature from the manifest before installation.
