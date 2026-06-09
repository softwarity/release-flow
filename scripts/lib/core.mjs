// Minimal GitHub Actions toolkit helpers — no dependencies.
// Inputs are read from RNA_<UPPER_SNAKE> env vars set by action.yml.
// Outputs are written to the $GITHUB_OUTPUT file (multiline-safe).
import fs from 'node:fs';

const envKey = (name) => 'RNA_' + name.toUpperCase().replace(/[-\s]/g, '_');

export const getInput = (name, def = '') => {
  const v = process.env[envKey(name)];
  return v === undefined || v === '' ? def : v.trim();
};

export const getBool = (name, def = false) => {
  const v = getInput(name, def ? 'true' : 'false').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

const command = (name, message) => process.stdout.write(`::${name}::${message}\n`);

export const info = (m) => process.stdout.write(`${m}\n`);
export const warn = (m) => command('warning', m);
export const error = (m) => command('error', m);
export const startGroup = (m) => command('group', m);
export const endGroup = () => process.stdout.write('::endgroup::\n');

export const group = async (name, fn) => {
  startGroup(name);
  try {
    return await fn();
  } finally {
    endGroup();
  }
};

export const setOutput = (name, value) => {
  const file = process.env.GITHUB_OUTPUT;
  const v = String(value ?? '');
  if (!file) {
    info(`(output) ${name}=${v.split('\n')[0]}`);
    return;
  }
  let delim = 'RNA_EOF_' + Buffer.from(name).toString('hex');
  while (v.includes(delim)) delim += '_';
  fs.appendFileSync(file, `${name}<<${delim}\n${v}\n${delim}\n`);
};

export const setFailed = (m) => {
  error(m);
  process.exitCode = 1;
};
