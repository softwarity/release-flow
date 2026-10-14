# Release Flow — GitHub Action

A small, dependency-free composite action that turns a single manual choice
(`patch` / `minor` / `major`) into a complete release:

1. **Bumps the version** in the right place for your language
   (`package.json` for Node, or **the git tags** otherwise — no file to manage).
2. **Resolves the release notes**: renames the unreleased
   `## NEXT RELEASE` section to the new version number and extracts its body.
3. **Commits and tags** that state — so the tag captures the finished notes.
4. **Pushes** the commit and the tag, then **publishes a GitHub Release** from
   the extracted body. With the optional [`publish`](#publishing-before-pushing)
   input, your publish command (e.g. `npm publish`) runs first, between the local
   tag and the push: if it fails, nothing has been pushed.
5. **Re-opens a fresh `## NEXT RELEASE` section** for the next cycle — so
   contributors only ever *fill in* a section, never add one.

> The placeholder is the whole point: at authoring time you don't yet know
> whether the next release is a patch, minor or major, so you write under a
> stable `## NEXT RELEASE` heading. The action stamps the real number at release
> time, once the bump is known.

## Quick start

```yaml
name: Release

on:
  workflow_dispatch:            # adds a "Run workflow" button in the Actions tab
    inputs:
      bump:
        description: 'Version bump type'
        required: true
        default: patch
        type: choice            # <-- this is what renders the patch/minor/major dropdown
        options:
          - patch
          - minor
          - major

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.PAT_TOKEN }}   # PAT so the pushed tag can trigger a publish workflow
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci && npm run build && npm test
      - uses: softwarity/release-flow@v1
        with:
          bump: ${{ inputs.bump }}           # the value picked in the dropdown
```

## Choosing patch / minor / major

The bump is **not** decided by the action — *you* pick it when you launch the
workflow. The `workflow_dispatch` + `type: choice` block above is what GitHub
turns into a dropdown:

> **Actions** tab → pick the *Release* workflow → **Run workflow** → choose
> `patch` / `minor` / `major` → **Run workflow**.

That choice arrives as `${{ inputs.bump }}` (equivalently
`${{ github.event.inputs.bump }}`) and is forwarded to the action's `bump`
input. The action just trusts that string — so you can trigger it any other way
too (a PR label, a `release` event, the API…) as long as you pass
`patch | minor | major` into `bump:`. The dropdown is simply the common case.

A full, copy-pasteable workflow is in [`examples/release.yml`](examples/release.yml).

## Your `RELEASE_NOTES.md`

```markdown
# Release Notes

## NEXT RELEASE

### Features

- The thing you just built

---

## 2.0.1

- The previous release
```

During the cycle, contributors edit the `## NEXT RELEASE` section. On release
with `bump: patch`, given the last version `2.0.1`, the action produces:

```markdown
# Release Notes

## NEXT RELEASE          <- fresh & empty: where the NEXT release is drafted

---

## 2.0.2                 <- was NEXT RELEASE; this is the v2.0.2 release

### Features

- The thing you just built

---

## 2.0.1
...
```

…and a GitHub Release **v2.0.2** whose body is the `### Features …` block — the
empty `## NEXT RELEASE` is **not** part of it: the body is sliced from the
`## 2.0.2` section *before* the placeholder is re-added.

By default (`single-commit: true`) this is **one commit**, so the `v2.0.2` tag
includes the empty `## NEXT RELEASE` at the top. That's intentional — it's just
the (still-empty) drafting section for the next version, and it never reaches the
GitHub Release body or the published package. Want a tag with no placeholder at
all? Set `single-commit: false` (see [One commit per release](#one-commit-per-release-and-the-tag)).

If the notes file doesn't exist, the action creates it.

## Versioning convention

The **last published** version is the starting point; the action bumps from it.
For Node that's `npm version <bump> --no-git-tag-version` (which also keeps
`package-lock.json` in sync). With no manifest, the last published version is read
straight from the **git tags** — the highest `vX.Y.Z`, with moving pointers like
`v1` ignored, and `0.0.0` if there are none — so there is no version file to keep
in sync. A committed `.version` file is still available via `language: generic`.

## Language support

| `language` | Version source | Bump |
|------------|----------------|------|
| `node`     | `package.json` `"version"` | `npm version <bump>` |
| `tag`      | the highest `vX.Y.Z` **git tag** (no file) | semver math |
| `maven_docker` | git tag → written into `pom.xml` and the modules' poms (`mvn versions:set`, run in Docker) | semver math |
| `generic`  | `.version` (or `version-file`) | semver math |
| `auto` (default) | `package.json`→`node`, `pom.xml`+`Dockerfile`→`maven_docker`, else `tag` | — |

`tag` and `maven_docker` read the version from the git tags, so check out with
`fetch-depth: 0`. **`maven_docker`** also needs Docker on the runner: it runs
`mvn versions:set` in the `maven-image` container (default `maven:3-eclipse-temurin`)
— no local Java/Maven needed, and real `mvn` updates **only** the project
`<version>`, never the `<parent>` or dependency versions (a regex would). It suits a
Maven project shipped as a Docker image, where the tag is the source of truth and the
pom version just needs to stay in sync. `Python` / `Rust` / `PHP` are on the roadmap.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `bump` | `patch` | `patch` \| `minor` \| `major` |
| `notes-file` | `RELEASE_NOTES.md` | Path to the notes markdown file |
| `placeholder` | `NEXT RELEASE` | Heading text of the unreleased section (no `## `) |
| `language` | `auto` | `auto` \| `node` \| `tag` \| `maven_docker` \| `generic` |
| `version-file` | `.version` | Version file for `language: generic` |
| `helm-chart` | `auto` | `auto` (sync `helm/Chart.yaml` if present) \| `none` \| a chart directory or `Chart.yaml` path |
| `helm-app-version` | `true` | Also set the chart's `appVersion` to the released version |
| `maven-image` | `maven:3-eclipse-temurin` | Docker image running `mvn versions:set` for `language: maven_docker` |
| `tag-prefix` | `v` | Prefix prepended to the version to form the tag |
| `publish` | _(empty)_ | Command that publishes the release (e.g. `npm publish`), run **before anything is pushed** — see [Publishing before pushing](#publishing-before-pushing) |
| `create-release` | `true` | Create a GitHub Release from the notes |
| `release-draft` | `false` | Create the Release as a draft |
| `release-prerelease` | `false` | Mark the Release as a prerelease |
| `push` | `true` | Push the commits and the tag |
| `major-tag` | `false` | Also force-move the major tag (`v1`) to this release — for publishing reusable actions |
| `single-commit` | `true` | One commit per release (fold the placeholder in; the tag then includes the empty `## NEXT RELEASE`) |
| `commit-user-name` | `github-actions[bot]` | git `user.name` for the commits |
| `commit-user-email` | `github-actions[bot]@users.noreply.github.com` | git `user.email` |
| `token` | `${{ github.token }}` | Token used to create the Release (needs `contents: write`) |
| `dry-run` | `false` | Edit files but skip commit/tag/push/release |

## Outputs

| Output | Description |
|--------|-------------|
| `version` | New version, no prefix (e.g. `2.0.2`) |
| `previous-version` | Version before the bump |
| `tag` | Tag created, with prefix (e.g. `v2.0.2`) |
| `notes` | Extracted release-notes body |
| `release-url` | URL of the created GitHub Release |
| `notes-file-created` | `true` if the notes file was created this run |

## Helm charts

A project that ships a chart next to its code has a second place holding the
version. If that chart sits at **`helm/Chart.yaml`** — the conventional spot for
a chart living beside the code it deploys — there is **nothing to configure**:

```yaml
- uses: softwarity/release-flow@v1
  with:
    bump: ${{ inputs.bump }}
```

The chart is rewritten and **committed with the release**, so the tag points at a
chart that deploys that tag's image. Releasing `1.4.0` writes:

```yaml
version: 1.4.0        # the chart's own version
appVersion: "1.4.0"   # the image tag it deploys
```

Detection is deliberately narrow — exactly `helm/Chart.yaml`, never a recursive
search, and never `charts/`, which is where Helm puts dependency subcharts.
Elsewhere, or to opt out:

```yaml
    helm-chart: deploy/chart   # an explicit directory or Chart.yaml (missing = error)
    helm-chart: none           # leave the chart alone, even if helm/ exists
```

Only the **top-level** keys are touched, so a `dependencies:` block keeps its own
pinned versions. A chart with no `appVersion` gets one; set
`helm-app-version: false` to version the chart independently of the app. The
chart's `values.yaml` should then leave `image.tag` empty and fall back to
`.Chart.AppVersion`, so nothing repeats the number:

```yaml
image: {{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
```

## Publishing before pushing

By default the action pushes the commit and the tag and creates the GitHub
Release; publishing the package is up to you, afterwards. When that publish
fails (registry quota, a version already taken, an expired token), the release
commit, the tag and the Release are already public and must be rolled back by
hand.

The `publish` input moves the publish command **inside** the action, between the
local tag and the push:

| Without `publish` (default) | With `publish` |
|-----------------------------|----------------|
| 1. commit + tag (local) | 1. commit + tag (local) |
| 2. push commit + tag | 2. **run `publish`** |
| 3. GitHub Release | 3. push commit + tag |
| | 4. GitHub Release |

If the command fails, the run fails and nothing has left the runner: no tag, no
Release, no commit on the remote. Fix the cause and run the release again.

### When to use it

Use `publish` when the package is published **in the same job** as the release,
by a step that would otherwise come after the action:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '20', registry-url: 'https://npm.pkg.github.com' }
- run: npm ci && npm run build && npm test
- uses: softwarity/release-flow@v1
  with:
    bump: ${{ inputs.bump }}
    publish: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

See [`examples/release-publish.yml`](examples/release-publish.yml) for the whole
workflow. Build and test **before** the action: `publish` should only push out
an artifact that is already built.

### When not to use it

Leave `publish` empty when the package is published by **another workflow
triggered by the tag** (`on: push: tags`, the [Quick start](#quick-start) setup
with a PAT). That workflow needs the tag pushed to start at all, so it cannot
run before the push — and passing `publish` there as well would publish twice.

Without `publish`, the action behaves exactly as before.

### What the command gets

- It runs under `bash -e -o pipefail` from the repository root: a multi-line
  script stops at its first failing line.
- `RELEASE_VERSION` (`1.4.0`) and `RELEASE_TAG` (`v1.4.0`) are set, e.g. for
  `docker push my/image:$RELEASE_VERSION`.
- The files are already bumped: `package.json`, the chart, the notes carry the
  new version.
- It inherits the job's environment: set the registry credentials (e.g.
  `NODE_AUTH_TOKEN`) on the job or on the action step, as for any other step.
- In `dry-run`, it is skipped, like the commit and the push.

### By ecosystem

One rule first: **anything that carries the version number must be built inside
`publish`, not in an earlier step.** The action bumps the version when it runs;
an artifact built before it embeds the previous number, and you would publish a
`1.4.0` build under the `v1.5.0` tag. Tests can run before the action — the
build that gets published runs in `publish`. (`npm publish` of a plain source
package is fine: it packs the files after the bump, and so does a build in its
`prepublishOnly` script.)

| Ecosystem | `publish` | Watch out for |
|-----------|-----------|---------------|
| npm package | `npm publish` | Credentials: `NODE_AUTH_TOKEN` + `registry-url` on `actions/setup-node`. |
| Angular library (ng-packagr) | `npm run build && npm publish dist/my-lib` | The action bumps the **root** `package.json` only. If `projects/my-lib/package.json` has its own `version`, `dist/` keeps the old one: sync it first — `npm version "$RELEASE_VERSION" --no-git-tag-version --prefix projects/my-lib && npm run build && npm publish dist/my-lib`. |
| Maven | `mvn -B deploy` | With `language: maven_docker`, the pom already carries the new version. `mvn` runs on the runner, not in Docker: add `actions/setup-java` (with its `server-id` for the credentials). |
| Docker image | `docker build -t ghcr.io/org/app:$RELEASE_VERSION . && docker push ghcr.io/org/app:$RELEASE_VERSION` | `docker login` goes in a step **before** the action. Re-tagging an image built earlier (`docker tag` + `docker push`) is only safe if the version is not baked into it (label, version file, build-arg). |
| Go module | _(none)_ | A Go module is published by the tag itself (proxy.golang.org picks it up): keep the default mode. Use `publish` only for side artifacts, such as an image. |
| GoReleaser | _(none)_ | GoReleaser needs the tag already on the remote and creates the GitHub Release itself: keep the default mode with a tag-triggered workflow, and set `create-release: false` to avoid a second Release. |

A file that `publish` modifies (like the library's `package.json` above) is not
part of the release commit, which was made before it ran. To commit a file
along with the release, change it and `git add` it in a step **before** the
action: the release commit includes whatever is already staged.

### The failure that remains

Publishing cannot be undone, so one failure is still possible: the publish
succeeds, then the push is rejected because someone pushed to the branch during
the release. To make it rare, the action checks right before publishing that the
branch has not moved since the checkout, and stops — with nothing published —
if it has. Only a push landing during the publish itself slips through. The run
then fails with an explicit message: the package is out, but the release commit
and the tag existed only on the runner. Redo that commit by hand (version bumped,
notes under `## X.Y.Z`), tag it and push; re-running the workflow would try to
publish the same version again.

## Permissions &amp; tokens

- The job needs `permissions: contents: write` (push commits/tags, create the Release).
- The **GitHub Release** is created with `token` (default `GITHUB_TOKEN`).
- The **git push** uses whatever credentials `actions/checkout` set up. If a
  pushed tag must trigger another workflow (e.g. an NPM publish on `push: tags`),
  check out with a **PAT** — pushes made with `GITHUB_TOKEN` do not trigger
  workflows. With [`publish`](#publishing-before-pushing) nothing needs to be
  triggered, so `GITHUB_TOKEN` is enough (unless branch protection requires
  otherwise).
- `publish` uses the registry credentials of the job, not `token`. Publishing to
  GitHub Packages also needs `permissions: packages: write`.

## One commit per release (and the tag)

By default (`single-commit: true`) a release is **one commit**: the resolved
notes (`## X.Y.Z`) and a fresh empty `## NEXT RELEASE` are folded together, and
that commit is tagged — so contributors pull a single commit per release. The
trade-off: the `RELEASE_NOTES.md` *inside the tag* shows an empty `## NEXT
RELEASE` at the top. It's cosmetic — the GitHub Release body (extracted before)
and the published package are unaffected.

Set `single-commit: false` for a **pure tag** instead: the action tags the
`version + resolved notes` commit (no placeholder), then re-opens `## NEXT
RELEASE` in a *separate* follow-up commit carrying `[skip ci]`. The tag never
contains the placeholder, at the cost of two commits per release.

(Folding with `git commit --amend` after tagging is deliberately **not** used: it
would leave the tag pointing at a commit *off the branch*, breaking `git
describe` and GitHub's "N commits since this release".)

## Migrating an existing `RELEASE_NOTES.md`

If your top section is currently a *guessed* next number (e.g. `## 0.2.10`),
rename that heading once to `## NEXT RELEASE`. From then on the action fills it in.

## Publishing a reusable action

If the repo you're releasing **is itself a GitHub Action** (consumed as
`you/action@v1`), set `major-tag: true`. After tagging `vX.Y.Z`, the action also
force-moves the major tag (`vX`) to the same commit, so your `@v1` consumers get the
new release with no extra step — no `npm`, no PAT needed. release-flow uses this on
itself (see its own [`.github/workflows/release.yml`](.github/workflows/release.yml)).

## Local development

```bash
node scripts/test.mjs     # pure-logic smoke tests (notes parsing + semver)
```

Run the whole flow without side effects on any repo with:

```yaml
- uses: softwarity/release-flow@v1
  with: { bump: patch, dry-run: true }
```

## License

[Apache-2.0](LICENSE)
