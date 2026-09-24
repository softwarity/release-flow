// Smoke tests for the pure logic (no git / gh / fs side effects beyond a tmp dir).
// Run with: node scripts/test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bumpSemver } from './lib/version.mjs';
import { ensureFile, resolveSection, insertPlaceholder } from './lib/notes.mjs';
import { setChartVersion, resolveChartFile, syncChart, DEFAULT_CHART } from './lib/helm.mjs';

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

// --- helm: rewrite version + appVersion, never a dependency's ------------
{
  const chart = [
    'apiVersion: v2',
    'name: my-app',
    'description: A service',
    'type: application',
    'version: 0.0.0',
    'appVersion: "0.0.0"',
    'dependencies:',
    '  - name: redis',
    '    version: 17.11.3',
    '    repository: https://charts.bitnami.com/bitnami',
  ].join('\n');

  const out = setChartVersion(chart, '1.4.0');
  assert.ok(out.includes('\nversion: 1.4.0'), 'chart version bumped');
  assert.ok(out.includes('\nappVersion: "1.4.0"'), 'appVersion bumped and quoted');
  assert.ok(out.includes('    version: 17.11.3'), "dependency version untouched");
  assert.ok(out.includes('name: my-app'), 'rest of the chart untouched');
  ok('setChartVersion rewrites the top-level keys only');
}

// --- helm: appVersion left alone when asked ------------------------------
{
  const chart = 'version: 0.0.0\nappVersion: "9.9.9"\n';
  const out = setChartVersion(chart, '2.0.0', { appVersion: false });
  assert.equal(out, 'version: 2.0.0\nappVersion: "9.9.9"\n');
  ok('setChartVersion leaves appVersion alone with appVersion:false');
}

// --- helm: a chart with no appVersion gets one ---------------------------
{
  const out = setChartVersion('name: c\nversion: 0.1.0\n', '1.0.0');
  assert.equal(out, 'name: c\nversion: 1.0.0\nappVersion: "1.0.0"\n');
  ok('setChartVersion adds appVersion when the chart has none');
}

// --- helm: a chart with no version is an error ---------------------------
{
  assert.throws(() => setChartVersion('name: c\n', '1.0.0'), /no top-level "version:"/);
  ok('setChartVersion rejects a Chart.yaml with no version key');
}

// --- helm: path resolution + dry-run writes nothing ----------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rna-helm-'));
  const chartDir = path.join(dir, 'helm');
  fs.mkdirSync(chartDir);
  const file = path.join(chartDir, 'Chart.yaml');
  fs.writeFileSync(file, 'name: c\nversion: 0.0.0\nappVersion: "0.0.0"\n');

  assert.equal(resolveChartFile(''), null, 'empty input disables the feature');
  assert.equal(resolveChartFile('none'), null, '"none" disables it explicitly');
  assert.equal(resolveChartFile('NONE'), null, 'case does not matter');
  assert.equal(resolveChartFile(chartDir), file, 'directory resolves to Chart.yaml');
  assert.equal(resolveChartFile(file), file, 'an explicit Chart.yaml is kept');
  assert.throws(() => resolveChartFile(path.join(dir, 'nope')), /not found/);

  assert.deepEqual(syncChart({ chartInput: '', version: '1.0.0' }), []);
  syncChart({ chartInput: chartDir, version: '1.0.0', dryRun: true });
  assert.ok(fs.readFileSync(file, 'utf8').includes('version: 0.0.0'), 'dry-run writes nothing');

  const written = syncChart({ chartInput: chartDir, version: '1.0.0' });
  assert.deepEqual(written, [file]);
  assert.ok(fs.readFileSync(file, 'utf8').includes('version: 1.0.0'), 'real run writes the file');

  fs.rmSync(dir, { recursive: true, force: true });
  ok('syncChart resolves the path, honours dry-run and returns the files to commit');
}

// --- helm: auto-detection of helm/Chart.yaml -----------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rna-auto-'));
  const cwd = process.cwd();
  process.chdir(dir);

  // No chart in the project: auto stays quiet, it does not throw.
  assert.equal(resolveChartFile('auto'), null, 'auto is a no-op without a chart');
  assert.equal(resolveChartFile(undefined), null, 'undefined behaves like disabled');

  // The conventional location is picked up with no configuration at all.
  fs.mkdirSync('helm');
  fs.writeFileSync(path.join('helm', 'Chart.yaml'), 'name: c\nversion: 0.0.0\nappVersion: "0.0.0"\n');
  assert.equal(resolveChartFile('auto'), DEFAULT_CHART, 'auto finds helm/Chart.yaml');
  assert.equal(resolveChartFile('AUTO'), DEFAULT_CHART, 'case does not matter');
  assert.equal(resolveChartFile('none'), null, 'none wins over a present chart');

  // charts/ is where Helm puts dependency subcharts — never auto-detected.
  fs.mkdirSync(path.join('charts', 'redis'), { recursive: true });
  fs.writeFileSync(path.join('charts', 'redis', 'Chart.yaml'), 'name: redis\nversion: 17.11.3\n');
  fs.rmSync('helm', { recursive: true, force: true });
  assert.equal(resolveChartFile('auto'), null, 'a subchart under charts/ is never picked up');

  // An explicit path that does not exist is still an error, not a silent skip.
  assert.throws(() => resolveChartFile('deploy/chart'), /not found/);

  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
  ok('resolveChartFile: auto detects helm/Chart.yaml, none disables, charts/ is ignored');
}

console.log(`\n${passed} checks passed.`);
