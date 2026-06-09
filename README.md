# Release Notes &amp; Version — GitHub Action

A small, dependency-free composite action that turns a single manual choice
(`patch` / `minor` / `major`) into a complete release:

1. **Bumps the version** in the right place for your language
   (`package.json` for Node, a plain `.version` file otherwise).
2. **Resolves the release notes**: renames the unreleased
   `## NEXT RELEASE` section to the new version number and extracts its body.
3. **Commits and tags** that state — so the tag captures the finished notes.
4. **Publishes a GitHub Release** from the extracted body.
5. **Re-opens a fresh `## NEXT RELEASE` section** in a *follow-up* commit, ready
   for the next cycle — so contributors only ever *fill in* a section, never add one.

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
      - uses: softwarity/release-notes-action@v1
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
with `bump: patch`, given `package.json` at `2.0.1`, the action produces:

```markdown
# Release Notes

## NEXT RELEASE          <- fresh, empty (added after the tag)

---

## 2.0.2                 <- was NEXT RELEASE; this is what the v2.0.2 tag points at

### Features

- The thing you just built

---

## 2.0.1
...
```

and a GitHub Release **v2.0.2** whose body is the `### Features …` block.

If the notes file doesn't exist, the action creates it.

## Versioning convention

The version stored in your manifest is treated as the **last published**
version; the action bumps from it. For Node this is exactly
`npm version <bump> --no-git-tag-version` (and it keeps `package-lock.json` in
sync). For the generic case it's plain `MAJOR.MINOR.PATCH` math on the
`.version` file (starting from `0.0.0` if the file is absent).

## Language support

| `language` | Version source | Bump |
|------------|----------------|------|
| `node`     | `package.json` `"version"` | `npm version <bump>` |
| `generic`  | `.version` (or `version-file`) | semver math |
| `auto` (default) | `node` if `package.json` exists, else `generic` | — |

`Python` / `Rust` / `PHP` manifests are on the roadmap behind the same
interface; until then point `version-file` at a `.version` for those repos.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `bump` | `patch` | `patch` \| `minor` \| `major` |
| `notes-file` | `RELEASE_NOTES.md` | Path to the notes markdown file |
| `placeholder` | `NEXT RELEASE` | Heading text of the unreleased section (no `## `) |
| `language` | `auto` | `auto` \| `node` \| `generic` |
| `version-file` | `.version` | Version file for the `generic` language |
| `tag-prefix` | `v` | Prefix prepended to the version to form the tag |
| `create-release` | `true` | Create a GitHub Release from the notes |
| `release-draft` | `false` | Create the Release as a draft |
| `release-prerelease` | `false` | Mark the Release as a prerelease |
| `push` | `true` | Push the commits and the tag |
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

## Permissions &amp; tokens

- The job needs `permissions: contents: write` (push commits/tags, create the Release).
- The **GitHub Release** is created with `token` (default `GITHUB_TOKEN`).
- The **git push** uses whatever credentials `actions/checkout` set up. If a
  pushed tag must trigger another workflow (e.g. an NPM publish on `push: tags`),
  check out with a **PAT** — pushes made with `GITHUB_TOKEN` do not trigger
  workflows.

## Why the tag comes *before* the new placeholder

The released tag should contain the *finished* notes for that version and
nothing else. So the action commits `version + resolved notes`, **tags that
commit**, creates the Release, and only then adds the empty `## NEXT RELEASE`
section in a separate commit. The fresh placeholder is never inside a release tag.

That second commit only touches the notes file, so its message carries
`[skip ci]` — it won't re-trigger push-based CI. The tag points at the *release*
commit, so tag-triggered workflows (e.g. an NPM publish on `push: tags`) still run.

## Migrating an existing `RELEASE_NOTES.md`

If your top section is currently a *guessed* next number (e.g. `## 0.2.10`),
rename that heading once to `## NEXT RELEASE`. From then on the action fills it in.

## Local development

```bash
node scripts/test.mjs     # pure-logic smoke tests (notes parsing + semver)
```

Run the whole flow without side effects on any repo with:

```yaml
- uses: softwarity/release-notes-action@v1
  with: { bump: patch, dry-run: true }
```

## License

[MIT](LICENSE)
