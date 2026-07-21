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

Update `CHANGELOG.md` and `apps/web/src/content/docs/changelog.md` before tagging — the
release notes are assembled from the changelog, not from commit messages.

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
the tap. Leave the variable unset to skip it.

## Documentation site

`apps/web` deploys to GitHub Pages through
[`.github/workflows/web-deploy.yml`](../.github/workflows/web-deploy.yml) on every push to
`main` that touches `apps/web/**`. `npm run web:check-docs` validates screenshot
inventory, internal links, and drift between the YAML reference docs and the Go source —
it runs in CI and requires `npm run web:build` first.

`apps/web/DOCS_COVERAGE.md` records the desktop tag the docs were last audited against.
The docs check fails when that tag falls behind the latest `v*` tag, so update it as part
of a release.
