# Releasing

Maintainer notes. Contributors don't need any of this to build or test Relay — see
[CONTRIBUTING.md](../CONTRIBUTING.md) for that.

Relay follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are
published from this repository: pushing a `v*` tag triggers
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which builds every
platform, signs the updater assets, and creates the GitHub release.

## Cutting a release

```bash
make release          # bump patch, tag, push
make release-minor    # bump minor
make release-major    # bump major
make release v=1.2.3  # explicit version
```

Each target refuses to run on a dirty working tree. It creates an annotated `v<version>`
tag and pushes it; CI takes over from there.

Once the workflow finishes, work through
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) — the installers, the first launch
and the update from the previous version are the parts no test can reach.

Update `CHANGELOG.md` and `apps/web/src/content/docs/changelog.md` before tagging — the
release notes are assembled from the changelog, not from commit messages.

The GitHub release body is the tag's annotation, so write it as the notes you want
published. When passing a message with `-F`, add `--cleanup=verbatim`: git's default
cleanup strips every line beginning with `#`, which silently removes markdown headings
from the release page.

```bash
git tag -a v1.2.3 --cleanup=verbatim -F notes.md
```

`DOCS_COVERAGE.md` can only be updated *after* the tag exists — `web:check-docs` compares
the recorded tag against the newest `v*` tag, so record the audit in a follow-up commit.

## Update signing

Relay's auto-updater verifies two things before installing a binary: the SHA-256 recorded
in `latest.json`, and a [minisign](https://jedisct1.github.io/minisign/) signature. The
checksum protects against corruption in transit; the signature protects against a
compromised release channel. A build that has a public key embedded rejects any update
without a matching signature, even when the checksum is correct.

Generate the keypair once, on a trusted machine — never on CI:

```bash
make update-keygen
```

Press Enter twice for a passwordless key if CI will do the signing. Then configure the
repository under **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|------|------|-------|
| Variable | `UPDATE_PUBLIC_KEY` | The single-line public key from `update-signing-key.pub` |
| Secret | `UPDATE_SIGNING_KEY` | The full contents of `update-signing-key` |

`update-signing-key` is listed in `.gitignore` and must never be committed. If it leaks,
generate a new keypair and ship a release signed with the old key that carries a build
containing the new public key — otherwise existing installs will reject every future
update.

Release builds require both values. Local development builds may omit the public key, in
which case update signature verification is skipped.

To sign artifacts from a local build instead of going through CI:

```bash
make build-all
make update-sign      # signs everything in apps/desktop/build/bin/
```

## Windows MSIX signing

`make build-windows` produces both the NSIS installer and an MSIX package. Sign the MSIX
locally by passing the certificate:

```bash
make build-windows MSIX_CERT_PATH=... MSIX_CERT_PASSWORD=...
```

In CI, set the `MSIX_CERTIFICATE_BASE64` and `MSIX_CERTIFICATE_PASSWORD` repository
secrets and the release workflow signs the MSIX artifacts automatically.

## macOS-only local release

Useful when GitHub Actions minutes are exhausted (macOS runners bill at 10× on the free
tier) or when a fix needs to ship without waiting on CI. The only required tool is `gh`:

```bash
gh auth login                    # one-time
make release-mac-local           # bump patch and ship
make release-mac-local v=1.2.3
make release-mac-local NOTES="Fix A + Fix B"
```

This builds the universal binary locally, packages the `.app` as a `.zip` (or a `.dmg`
when `create-dmg` is installed — `brew install create-dmg`), signs everything with
minisign if `update-signing-key` is present in the repo root, generates a macOS-only
`latest.json`, and uploads the result via `gh release create`. The updater downloads the
raw binary directly, so no DMG or zip is needed for existing users.

Users on Windows and Linux stay on their current version until a full cross-platform
release lands; the updater ignores platforms missing from the manifest.

The git tag created by `release-mac-local` stays **local only** so it doesn't trigger the
CI release workflow. Push it manually with `git push origin v1.2.3` once CI minutes are
available again.

If the upload fails partway through, `make release-mac-publish` retries the publish step
with the artifacts already sitting in `release/`.

## Homebrew cask

The `homebrew` job in the release workflow runs only when the `HOMEBREW_TAP_REPOSITORY`
repository variable is set, and needs a `HOMEBREW_TAP_TOKEN` secret with write access to
the tap. Leave the variable unset to skip it — which is the current state: the job is
written and tested, but no tap exists yet.

The cask itself is generated by [`scripts/make-cask.py`](../scripts/make-cask.py), not
inline in the workflow, so CI can generate one from a stand-in DMG and check that it
parses. A cask is otherwise only exercised at install time, on someone else's machine.

### Before turning it on: notarization

Relay's macOS build is currently neither signed nor notarized. A `.dmg` downloaded by
hand is survivable — the user went looking for it and will click through Gatekeeper once.
Homebrew is not: it installs the app with the quarantine attribute, and the first launch
fails with *"Relay is damaged and can't be opened"*, which reads as a broken program
rather than an unsigned one. There is no way for a cask to waive quarantine.

Notarization needs an Apple Developer account, `codesign` with the hardened runtime,
`notarytool submit --wait` and `stapler staple` in the release job. It is worth doing for
every macOS user, not only for Homebrew — but until it exists, turning this channel on
makes the install worse than the download page.

### Setting up the tap

1. Create the tap repository. The name must start with `homebrew-`:
   `relay-client/homebrew-tap`. It can start **private** — Homebrew taps private
   repositories fine using the user's own git credentials, so a private tap works for
   people with access and can be flipped public when the channel opens.
2. Create a fine-grained PAT with **Contents: read and write** on that repository only,
   and store it as the `HOMEBREW_TAP_TOKEN` secret on `relay-client/relay`.
3. Set the `HOMEBREW_TAP_REPOSITORY` repository variable to `relay-client/homebrew-tap`.
4. Cut a release. The job commits `Casks/relay.rb` to the tap as `github-actions[bot]`.
5. Verify on a machine that has never had Relay installed:

   ```bash
   brew tap relay-client/tap
   brew install --cask relay
   open -a Relay
   brew uninstall --zap --cask relay
   ```

6. Make the tap public, and add the install line to `README.md` and to the download
   page (`apps/web/src/content/docs/download.mdx`):

   ```bash
   brew install --cask relay-client/tap/relay
   ```

   Do not advertise it before step 5 passes — a broken `brew install` is worse than no
   `brew install`.

The cask sets `auto_updates true`, because Relay updates itself and verifies each
download against a SHA256 and a minisign signature. Without it Homebrew would consider
itself the owner of the version and `brew upgrade` would reinstall whatever the tap last
recorded, undoing an update the app had already applied.

## Documentation site

`apps/web` deploys to GitHub Pages through
[`.github/workflows/web-deploy.yml`](../.github/workflows/web-deploy.yml) on every push to
`main` that touches `apps/web/**`. `npm run web:check-docs` validates screenshot
inventory, internal links, and drift between the YAML reference docs and the Go source —
it runs in CI and requires `npm run web:build` first.

`apps/web/DOCS_COVERAGE.md` records the desktop tag the docs were last audited against.
The docs check fails when that tag falls behind the latest `v*` tag, so update it as part
of a release.
