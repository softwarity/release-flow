// Orchestrator for the Release Notes & Version action.
//
// Flow (the tag is created BEFORE the next placeholder, on purpose):
//   1. bump the version manifest
//   2. resolve "## <placeholder>" -> "## <version>", extract the body
//   3. commit (version + notes) and tag           <- tag captures the resolved notes
//   4. create the GitHub Release from the body
//   5. open a fresh "## <placeholder>" section     <- separate commit, not in the tag
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as core from './lib/core.mjs';
import { applyBump } from './lib/version.mjs';
import { ensureFile, resolveSection, insertPlaceholder } from './lib/notes.mjs';
import * as git from './lib/git.mjs';
import { createRelease } from './lib/release.mjs';

const run = async () => {
  const bump = core.getInput('bump');
  const notesFile = core.getInput('notes-file', 'RELEASE_NOTES.md');
  const placeholder = core.getInput('placeholder', 'NEXT RELEASE');
  const language = core.getInput('language', 'auto');
  const versionFile = core.getInput('version-file', '');
  const tagPrefix = core.getInput('tag-prefix', 'v');
  const doRelease = core.getBool('create-release', true);
  const draft = core.getBool('release-draft', false);
  const prerelease = core.getBool('release-prerelease', false);
  const doPush = core.getBool('push', true);
  const userName = core.getInput('commit-user-name', 'github-actions[bot]');
  const userEmail = core.getInput('commit-user-email', 'github-actions[bot]@users.noreply.github.com');
  const dryRun = core.getBool('dry-run', false);

  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(`Input "bump" must be patch|minor|major (got "${bump}")`);
  }

  // 1. Bump version ---------------------------------------------------------
  const v = await core.group('Bump version', async () =>
    applyBump({ language, bump, versionFile, dryRun })
  );
  const tag = `${tagPrefix}${v.version}`;

  // 2. Resolve release notes ------------------------------------------------
  const { body, created } = await core.group('Resolve release notes', async () => {
    const created = ensureFile(notesFile, placeholder);
    if (created) core.warn(`${notesFile} did not exist — created it.`);
    const raw = fs.readFileSync(notesFile, 'utf8');
    const resolved = resolveSection(raw, placeholder, v.version);
    if (!resolved.body) core.warn(`Section "## ${placeholder}" is empty — release notes will be blank.`);
    if (!dryRun) fs.writeFileSync(notesFile, resolved.content);
    core.info(`Section "## ${placeholder}" -> "## ${v.version}" (${resolved.body.length} chars)`);
    return { body: resolved.body, created };
  });

  core.setOutput('version', v.version);
  core.setOutput('previous-version', v.previous);
  core.setOutput('tag', tag);
  core.setOutput('notes', body);
  core.setOutput('notes-file-created', String(created));
  core.setOutput('release-url', '');

  if (dryRun) {
    core.warn('dry-run: skipping commit, tag, push and release.');
    core.info(`Would create tag: ${tag}`);
    core.info(`--- notes ---\n${body || '(empty)'}`);
    return;
  }

  // 3. Commit + tag (before the fresh placeholder) --------------------------
  await core.group('Commit and tag', async () => {
    git.configUser(userName, userEmail);
    git.commit(v.version, [...v.files, notesFile]);
    git.tag(tag);
    if (doPush) {
      git.push();
      git.pushTag(tag);
    }
  });

  // 4. GitHub Release -------------------------------------------------------
  if (doRelease) {
    if (!doPush) {
      core.warn('create-release needs the tag pushed (push=false) — skipping the GitHub Release.');
    } else {
      await core.group('Create GitHub Release', async () => {
        const bodyFile = path.join(os.tmpdir(), 'release-notes-action-body.md');
        fs.writeFileSync(bodyFile, body || '_No release notes._');
        const url = createRelease({ tag, title: tag, bodyFile, draft, prerelease });
        core.info(`Release: ${url}`);
        core.setOutput('release-url', url);
      });
    }
  }

  // 5. Open a fresh placeholder for the next cycle --------------------------
  await core.group('Open next placeholder section', async () => {
    const next = insertPlaceholder(fs.readFileSync(notesFile, 'utf8'), placeholder);
    fs.writeFileSync(notesFile, next);
    // [skip ci]: this commit only re-opens the notes placeholder — no code change,
    // so it should not re-trigger push CI. The release tag points at the previous
    // commit, so tag-triggered workflows (publish) still run.
    git.commit(`chore: open "${placeholder}" section [skip ci]`, [notesFile]);
    if (doPush) git.push();
  });
};

run().catch((e) => core.setFailed(e.message));
