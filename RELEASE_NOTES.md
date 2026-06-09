# Release Notes

## NEXT RELEASE

---

## 1.0.1

### Changed

- Renamed from `release-notes-action` to **`release-flow`** (the old name still
  redirects, so existing `uses:` keep working).

### Added

- **`major-tag` input** (default `false`): when `true`, after tagging `vX.Y.Z` the
  action also force-moves the major tag (e.g. `v1`) to the same commit — so a repo that
  publishes a reusable action can advance its `@v1` pointer in the same run, with no
  `npm` and no PAT. release-flow now uses this on itself via `uses: ./`.

---

## 1.0.0

First release. A single `bump` input (`patch` / `minor` / `major`) drives a full
release: bump the version (Node `package.json` or a generic `.version` file), resolve
the `## NEXT RELEASE` changelog section into the new version, commit, tag `vX.Y.Z`,
publish a GitHub Release from that section, then re-open a fresh `## NEXT RELEASE`
placeholder in a follow-up `[skip ci]` commit. Composite action — no build step.

---
