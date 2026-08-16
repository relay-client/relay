# Release checklist

Everything automation can check is checked before a tag ever reaches a user: unit
tests, the Go suite on all three platforms, the E2E walkthrough, and a smoke test
that launches each built binary and compares the version it reports against the
tag. See [RELEASING.md](RELEASING.md) for how a release is cut.

What automation cannot check is the part that happens on a real machine: the
installer, the first launch, the update from the version people are actually
running, and the uninstall. That is what this list is for. It is deliberately
short — long checklists get skimmed.

Run it once per release, on each platform you have access to. If you only have
one machine, run that platform and say so in the release notes rather than
implying the others were verified.

---

## Before tagging

- [ ] `make check` passes locally.
- [ ] `CHANGELOG.md` and `apps/web/src/content/docs/changelog.md` describe this
      release, and the version numbers in both match the tag you are about to push.
- [ ] The previous release is installed somewhere you can update *from* — the
      update path is the one thing that cannot be tested after the fact.

## After the release workflow finishes

Check the run itself before touching a machine:

- [ ] Every platform job is green, including its smoke-test step.
- [ ] The release has `latest.json`, `SHA256SUMS.txt`, and a `.minisig` for each
      updatable binary.
- [ ] `latest.json` names this version and lists all three platform keys.

---

## Per platform

### macOS

- [ ] The `.dmg` opens, and dragging Relay to Applications works.
- [ ] First launch from Applications opens a window — Gatekeeper may warn on an
      unsigned build; note whether it did.
- [ ] **Settings → Support → Copy diagnostics** puts a report on the clipboard,
      and the version in it matches the release.
- [ ] **Settings → Support → Open log folder** opens Finder at the log directory
      and `relay.log` is there.
- [ ] Quit and relaunch: the workspace is where you left it.

### Windows

- [ ] The NSIS `.exe` installer completes and creates a Start Menu entry.
- [ ] First launch opens a window.
- [ ] Diagnostics and the log folder behave as above (Explorer opens the folder).
- [ ] Uninstall from *Apps & features* removes the app and leaves the user's
      workspace folder alone.
- [ ] If MSIX was signed this release, it installs too.

### Linux

- [ ] The `.AppImage` runs after `chmod +x`, on a machine that did **not** build
      it — this is where a missing `libwebkit2gtk` shows up, and the build
      machine can never catch it.
- [ ] Diagnostics and the log folder behave as above.

---

## The update path

Do this on at least one platform, every release. It is the check most likely to
find something, and the only one whose failure cannot be fixed by a later
release — a broken updater leaves users on a version that can no longer see the
fix.

- [ ] Launch the **previous** version.
- [ ] It notices this release and offers it.
- [ ] Applying it succeeds, and the app restarts on the new version.
- [ ] The workspace, environments, and history survived the update.

## Git-backed workspace

Only if this release touched anything Git-related:

- [ ] Open an existing Git workspace: the branch and changes are listed.
- [ ] Edit a request, and immediately commit — the edit is in the commit rather
      than left dangling afterwards.
- [ ] On a machine with **no** Git installed, the Git screen explains that
      rather than offering to initialise a repository.

---

## If something fails

Note it in the release notes if it ships anyway, or pull the release. A known
problem written down costs one line; the same problem found by a user costs a
thread.
