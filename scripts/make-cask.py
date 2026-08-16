#!/usr/bin/env python3
"""Generate the Homebrew cask for Relay.

Reads the release DMG (locally or over HTTP), computes its SHA256, and writes
Casks/relay.rb into a checked-out tap.

Usage:
    make-cask.py \
        --tap-dir tap \
        --version 1.4.0 \
        --repo relay-client/relay \
        [--dmg release/relay-1.4.0-darwin-universal.dmg]

The cask lives here rather than inline in the release workflow so it can be
generated and syntax-checked in CI. A cask is only exercised at install time,
on someone else's machine, which is the worst place to discover it is malformed.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

# Everything Relay writes outside its own bundle. requestStoreDir() in
# internal/api/store.go is os.UserConfigDir()/Relay, which on macOS is
# ~/Library/Application Support/Relay — the profile, the logs and the
# preferences all live under it.
ZAP_PATHS = [
    "~/Library/Application Support/Relay",
    "~/Library/Saved Application State/com.relayclient.relay.savedState",
]

CASK_TEMPLATE = '''cask "relay" do
  version "{version}"
  sha256 "{sha256}"

  url "https://github.com/{repo}/releases/download/v#{{version}}/relay-#{{version}}-darwin-universal.dmg",
      verified: "github.com/{repo}/"
  name "Relay"
  desc "Local-first desktop API client"
  homepage "https://github.com/{repo}"

  livecheck do
    url :url
    strategy :github_latest
  end

  # Relay updates itself: it checks for releases and verifies each download
  # against a SHA256 and a minisign signature before installing. Without this,
  # Homebrew believes it owns the version and `brew upgrade` would fight the
  # app's own updater, reinstalling whatever version the tap last recorded.
  auto_updates true

  depends_on macos: ">= :big_sur"

  app "Relay.app"

  # The encryption key Relay keeps in the login keychain (service "Relay",
  # account "request-store") is not removed: a cask cannot delete keychain
  # items. It is inert once the profile below is gone.
  zap trash: [
{zap_entries}
  ]
end
'''


def sha256_of(path_or_url: str) -> str:
    digest = hashlib.sha256()
    if path_or_url.startswith(("http://", "https://")):
        with urllib.request.urlopen(path_or_url) as response:  # noqa: S310 - release asset
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    with open(path_or_url, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_cask(version: str, repo: str, sha256: str) -> str:
    zap_entries = ",\n".join(f'    "{path}"' for path in ZAP_PATHS)
    return CASK_TEMPLATE.format(version=version, repo=repo, sha256=sha256, zap_entries=zap_entries)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tap-dir", required=True, type=Path)
    parser.add_argument("--version", required=True, help="release version without the v prefix")
    parser.add_argument("--repo", required=True, help="owner/repo that hosts the releases")
    parser.add_argument(
        "--dmg",
        default=None,
        help="path to the DMG. Defaults to downloading it from the release.",
    )
    args = parser.parse_args()

    version = args.version.lstrip("v")
    if not version:
        print("error: --version is empty", file=sys.stderr)
        return 1

    source = args.dmg or (
        f"https://github.com/{args.repo}/releases/download/"
        f"v{version}/relay-{version}-darwin-universal.dmg"
    )
    try:
        checksum = sha256_of(source)
    except OSError as err:
        print(f"error: could not read the DMG at {source}: {err}", file=sys.stderr)
        return 1

    casks_dir: Path = args.tap_dir / "Casks"
    casks_dir.mkdir(parents=True, exist_ok=True)
    out_path = casks_dir / "relay.rb"
    out_path.write_text(render_cask(version, args.repo, checksum), encoding="utf-8")
    print(f"wrote {out_path} for {version} ({checksum[:12]}…)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
