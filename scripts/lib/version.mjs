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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Highest released version taken straight from the git tags (e.g. v2.0.1),
// ignoring moving pointers like `v1`. Returns 0.0.0 when no tag matches.
// Needs the tags to be present (checkout with fetch-depth: 0).
const versionFromTags = (prefix) => {
  let out = '';
  try {
    out = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' });
  } catch {
    out = '';
  }
  const re = new RegExp(`^${escapeRe(prefix)}(\\d+)\\.(\\d+)\\.(\\d+)$`);
  const versions = out
    .split('\n')
    .map((t) => re.exec(t.trim()))
    .filter(Boolean)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  if (!versions.length) return '0.0.0';
  versions.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const [maj, min, pat] = versions[versions.length - 1];
  return `${maj}.${min}.${pat}`;
};

export const detectLanguage = (lang) => {
  if (lang && lang !== 'auto') return lang;
  // No manifest? Read the version straight from the git tags — no file to manage.
  return fs.existsSync('package.json') ? 'node' : 'tag';
};

// Applies the bump to the right manifest and returns
// { language, previous, version, files }. In dry-run, no file is written.
export const applyBump = ({ language, bump, versionFile, tagPrefix, mavenImage, dryRun }) => {
  const lang = detectLanguage(language);

  if (lang === 'tag') {
    const previous = versionFromTags(tagPrefix || 'v');
    const version = bumpSemver(previous, bump);
    info(`tag: ${previous} -> ${version} (from git tags — no version file)`);
    return { language: lang, previous, version, files: [] };
  }

  if (lang === 'maven_docker') {
    // Tag-driven version (the git tag is the source of truth); the pom.xml
    // <version> is synced to match. The bump runs INSIDE the maven Docker image,
    // so the runner needs no local Java/Maven, and real `mvn` updates ONLY the
    // project version — never the <parent> or dependency <version>s (the trap a
    // regex would fall into). The container runs as the current user with a
    // writable HOME so the edited pom is owned by the runner and git can commit it.
    const previous = versionFromTags(tagPrefix || 'v');
    const version = bumpSemver(previous, bump);
    const image = mavenImage || 'maven:3-eclipse-temurin';
    if (!dryRun) {
      execFileSync(
        'docker',
        [
          'run', '--rm',
          '-u', `${process.getuid()}:${process.getgid()}`,
          // Non-root user has no /root: give maven a writable HOME + .m2.
          '-e', 'HOME=/tmp',
          '-e', 'MAVEN_CONFIG=/tmp/.m2',
          '-v', `${process.cwd()}:/w`,
          '-w', '/w',
          image,
          'mvn', '-B', '-q', '-Duser.home=/tmp', 'versions:set',
          `-DnewVersion=${version}`,
          '-DgenerateBackupPoms=false',
        ],
        { stdio: 'inherit' }
      );
    }
    info(`maven_docker: ${previous} -> ${version} (tag-derived; pom.xml synced via ${image})`);
    return { language: lang, previous, version, files: ['pom.xml'] };
  }

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
