---
title: Installation
description: Install Relay on macOS, Windows, or Linux, and how its auto-updates work.
---

Relay publishes a build for each supported platform with every release. The download pages
carry the installer, the requirements, and the first-run steps for that operating system —
code-signing status differs by platform, so the notes are not interchangeable:

- **[Relay for macOS](/download/macos/)** — universal `.dmg`, macOS 11 Big Sur or later.
- **[Relay for Windows](/download/windows/)** — `.exe` installer or `.msix`, Windows 10 1903+ or 11, x64.
- **[Relay for Linux](/download/linux/)** — portable `.AppImage`, glibc 2.31+, x64.

Everything is on the
[releases page](https://github.com/relay-client/relay/releases/latest); there is no other
download host.

## Verify the download

SHA-256 checksums are published in `SHA256SUMS.txt` alongside the artifacts. Compare the
file you downloaded against the line for its filename before you run it — each download
page has the command for its platform's shell.

## Auto-updates

Relay checks `latest.json` from `relay-client/relay` after launch. Open
**Settings → Updates** to check and install manually.
**Settings → About → Automatically install updates** controls whether a discovered update
is installed in the background.

Updater binaries are verified against both the SHA-256 value and the minisign signature
from the manifest before installation, so a tampered or truncated download is rejected
rather than installed.

## First launch is blocked?

Neither the macOS DMG nor the Windows installer is signed today, so both operating systems
warn the first time. The steps are on the
[macOS](/download/macos/) and [Windows](/download/windows/) download pages, and the
[troubleshooting guide](/docs/troubleshooting/#macos-relay-cant-be-opened-because-apple-cannot-check-it-for-malicious-software)
covers the macOS message in more detail.
