// Language detection + version read/bump/write.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { info } from './core.mjs';

const SEMVER = /^\s*v?(\d+)\.(\d+)\.(\d+)\s*$/;

export const bumpSemver = (current, type) => {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`Cannot parse "${current}" as MAJOR.MINOR.PATCH`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (type === 'major') {
    maj += 1;
    min = 0;
    pat = 0;
  } else if (type === 'minor') {
    min += 1;
    pat = 0;
  } else if (type === 'patch') {
    pat += 1;
  } else {
    throw new Error(`Unknown bump type "${type}" (expected patch|minor|major)`);
  }
  return `${maj}.${min}.${pat}`;
};

export const detectLanguage = (lang) => {
  if (lang && lang !== 'auto') return lang;
  return fs.existsSync('package.json') ? 'node' : 'generic';
};

// Applies the bump to the right manifest and returns
// { language, previous, version, files }. In dry-run, no file is written.
export const applyBump = ({ language, bump, versionFile, dryRun }) => {
  const lang = detectLanguage(language);

  if (lang === 'node') {
    const readVersion = () => JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
    const previous = readVersion();
    if (!previous) throw new Error('package.json has no "version" field');
    let version;
    if (dryRun) {
      version = bumpSemver(previous, bump);
    } else {
      // Mirror the canonical command; also keeps package-lock.json in sync.
      execFileSync('npm', ['version', bump, '--no-git-tag-version'], { stdio: 'inherit' });
      version = readVersion();
    }
    const files = ['package.json'];
    if (fs.existsSync('package-lock.json')) files.push('package-lock.json');
    info(`node: ${previous} -> ${version}`);
    return { language: lang, previous, version, files };
  }

  // generic: a plain MAJOR.MINOR.PATCH in a version file (default .version)
  const vf = versionFile || '.version';
  const previous = fs.existsSync(vf) ? fs.readFileSync(vf, 'utf8').trim() || '0.0.0' : '0.0.0';
  const version = bumpSemver(previous, bump);
  if (!dryRun) fs.writeFileSync(vf, version + '\n');
  info(`generic (${vf}): ${previous} -> ${version}`);
  return { language: lang, previous, version, files: [vf] };
};
