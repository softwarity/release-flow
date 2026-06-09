// Smoke tests for the pure logic (no git / gh / fs side effects beyond a tmp dir).
// Run with: node scripts/test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bumpSemver } from './lib/version.mjs';
import { ensureFile, resolveSection, insertPlaceholder } from './lib/notes.mjs';

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`  ok  ${label}`);
};

// --- semver ---------------------------------------------------------------
assert.equal(bumpSemver('0.2.9', 'patch'), '0.2.10');
assert.equal(bumpSemver('0.2.9', 'minor'), '0.3.0');
assert.equal(bumpSemver('0.2.9', 'major'), '1.0.0');
assert.equal(bumpSemver('2.0.1', 'patch'), '2.0.2');
assert.equal(bumpSemver('v1.4.7', 'minor'), '1.5.0');
assert.throws(() => bumpSemver('1.2', 'patch'));
assert.throws(() => bumpSemver('2.0.1', 'mega'));
ok('bumpSemver patch/minor/major + validation');

// --- resolveSection: realistic section with ### sub-headings --------------
{
  const input = [
    '# Release Notes',
    '',
    '## NEXT RELEASE',
    '',
    '### Features',
    '',
    '- Add a thing',
    '- Add another thing',
    '',
    '### Fixes',
    '',
    '- Fix a thing',
    '',
    '---',
    '',
    '## 2.0.1',
    '',
    '- Previous release',
    '',
    '---',
  ].join('\n');

  const { content, body } = resolveSection(input, 'NEXT RELEASE', '2.0.2');
  assert.ok(content.includes('## 2.0.2'), 'heading renamed to version');
  assert.ok(!content.includes('## NEXT RELEASE'), 'placeholder heading gone');
  assert.ok(content.includes('## 2.0.1'), 'older section untouched');
  // body excludes the heading and the trailing --- and surrounding blanks
  assert.equal(
    body,
    ['### Features', '', '- Add a thing', '- Add another thing', '', '### Fixes', '', '- Fix a thing'].join('\n')
  );
  ok('resolveSection extracts body with ### sub-headings, strips trailing ---');
}

// --- resolveSection: empty placeholder (draw-adapter style) ---------------
{
  const input = '# Release Notes\n\n## NEXT RELEASE\n\n---\n\n## 0.2.9\n\n- old\n\n---\n';
  const { content, body } = resolveSection(input, 'NEXT RELEASE', '0.2.10');
  assert.equal(body, '');
  assert.ok(content.includes('## 0.2.10'));
  ok('resolveSection handles an empty placeholder section');
}

// --- resolveSection: missing placeholder throws a helpful error -----------
{
  assert.throws(
    () => resolveSection('# Release Notes\n\n## 1.0.0\n', 'NEXT RELEASE', '1.0.1'),
    /Placeholder heading "## NEXT RELEASE" not found/
  );
  ok('resolveSection throws when placeholder is missing');
}

// --- insertPlaceholder: re-opens a section after the H1 -------------------
{
  const resolved = '# Release Notes\n\n## 2.0.2\n\n- shipped\n\n---\n';
  const out = insertPlaceholder(resolved, 'NEXT RELEASE');
  assert.equal(
    out,
    '# Release Notes\n\n## NEXT RELEASE\n\n---\n\n## 2.0.2\n\n- shipped\n\n---\n'
  );
  ok('insertPlaceholder injects a fresh section right after the H1');
}

// --- insertPlaceholder: no H1 -> prepend ----------------------------------
{
  const out = insertPlaceholder('## 1.0.0\n\n- x\n', 'NEXT RELEASE');
  assert.ok(out.startsWith('## NEXT RELEASE\n\n---\n\n## 1.0.0'));
  ok('insertPlaceholder prepends when there is no H1');
}

// --- full round-trip: resolve then re-open, twice -------------------------
{
  let file = '# Release Notes\n\n## NEXT RELEASE\n\n- first feature\n\n---\n';
  // cycle 1: release 1.0.0
  let r = resolveSection(file, 'NEXT RELEASE', '1.0.0');
  assert.equal(r.body, '- first feature');
  file = insertPlaceholder(r.content, 'NEXT RELEASE');
  assert.ok(file.includes('## NEXT RELEASE'));
  assert.ok(file.includes('## 1.0.0'));
  // contributor fills the new section
  file = file.replace('## NEXT RELEASE\n\n---', '## NEXT RELEASE\n\n- second feature\n\n---');
  // cycle 2: release 1.1.0
  r = resolveSection(file, 'NEXT RELEASE', '1.1.0');
  assert.equal(r.body, '- second feature');
  file = insertPlaceholder(r.content, 'NEXT RELEASE');
  assert.ok(file.indexOf('## 1.1.0') < file.indexOf('## 1.0.0'), 'newest first');
  ok('two release cycles keep history newest-first');
}

// --- ensureFile creates a valid skeleton ----------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rna-test-'));
  const f = path.join(dir, 'RELEASE_NOTES.md');
  assert.equal(ensureFile(f, 'NEXT RELEASE'), true);
  assert.equal(ensureFile(f, 'NEXT RELEASE'), false);
  const created = fs.readFileSync(f, 'utf8');
  const r = resolveSection(created, 'NEXT RELEASE', '0.0.1');
  assert.equal(r.body, '');
  fs.rmSync(dir, { recursive: true, force: true });
  ok('ensureFile creates a skeleton that resolveSection accepts');
}

console.log(`\n${passed} checks passed.`);
