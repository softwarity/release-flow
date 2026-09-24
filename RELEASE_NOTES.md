# Release Notes

## NEXT RELEASE

---

## 1.4.0

### Changed

- **`helm-chart` now defaults to `auto`**: a project whose chart sits at
  `helm/Chart.yaml` — the conventional spot for a chart living beside the code it
  deploys — gets its `version` and `appVersion` synced with **no configuration at
  all**, the way `language: auto` already picks the version manifest. Detection is
  narrow on purpose: exactly that path, never a recursive search, and never
  `charts/`, where Helm keeps dependency subcharts. A project with no chart logs
  nothing and is unaffected.
- Note for existing users: a repository that already has `helm/Chart.yaml` and
  releases with `@v1` will now see that file updated and included in the release
  commit. That is the intent — a chart shipped with the code should carry the
  released version. Pass `helm-chart: none` to keep the previous behaviour, for
  instance when the chart follows a release cycle of its own.

---

## 1.3.0

### Added

- **`helm-chart`**: point it at a chart directory (or a `Chart.yaml`) and the
  release syncs the chart's `version` and `appVersion` to the released version,
  inside the release commit — so the tag points at a chart deploying that tag's
  image. Only top-level keys are rewritten, so a `dependencies:` block keeps its
  pinned versions; a chart without `appVersion` gets one. `helm-app-version:
  false` versions the chart independently of the app.

---

## 1.2.0

### Added

- **`maven_docker` language mode** for Maven projects shipped as a Docker image: the
  version is read from the git tags (the source of truth) and **synced into `pom.xml`**
  via `mvn versions:set` run **inside a Maven Docker image** (input `maven-image`,
  default `maven:3-eclipse-temurin`). No local Java/Maven on the runner, and real
  `mvn` updates only the project `<version>` (never `<parent>`/dependency versions).
  Needs Docker + `fetch-depth: 0`. **Auto-detected** when both a `pom.xml` and a
  `Dockerfile` are present — no need to set `language`.

---

## 1.1.1

### Added

- **`single-commit` input** (default `true`): a release is now **one commit** — the
  resolved notes and a fresh `## NEXT RELEASE` are folded together and tagged, so
  contributors pull a single commit per release. The tag's notes file then shows an
  empty `## NEXT RELEASE` at the top (cosmetic; the GitHub Release body and the
  published package are unaffected). Set `single-commit: false` to keep the previous
  two-commit behaviour (a "pure" tag with no placeholder).

---

## 1.1.0

### Added

- **`tag` language mode**: for a repo with no manifest, the version is read straight
  from the **git tags** (highest `vX.Y.Z`, moving pointers like `v1` ignored) instead
  of a `.version` file — nothing to commit or keep in sync. It's now the `auto` default
  when there is no `package.json`. Needs `fetch-depth: 0` at checkout.

### Changed

- release-flow now versions **itself** from its tags (dropped its `.version` file).

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
