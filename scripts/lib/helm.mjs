// Helm chart version sync: keep a Chart.yaml in step with the release.
//
// A chart carries two numbers — `version` (the chart itself) and `appVersion`
// (the application image it deploys). Projects that ship one chart alongside
// their code want both to equal the released version, so the tag points at a
// chart that deploys the image built from that very commit.
import fs from 'node:fs';
import path from 'node:path';

// Accepts the chart directory ("helm", "deploy/chart") or the Chart.yaml itself.
// Returns null when the input is empty (feature disabled).
export const resolveChartFile = (input) => {
  const p = (input || '').trim();
  if (!p) return null;
  const file = /\.ya?ml$/.test(p) ? p : path.join(p, 'Chart.yaml');
  if (!fs.existsSync(file)) {
    throw new Error(`helm-chart: "${file}" not found — pass the chart directory or its Chart.yaml.`);
  }
  return file;
};

// Rewrites the top-level `version:` and (optionally) `appVersion:` keys.
//
// Anchored at column 0 on purpose: a Chart.yaml may declare `dependencies:`
// whose entries carry their own indented `version:` — a looser pattern would
// bump a dependency instead of the chart.
export const setChartVersion = (content, version, { appVersion = true } = {}) => {
  const versionRe = /^version:[ \t]*.*$/m;
  if (!versionRe.test(content)) {
    throw new Error('helm-chart: Chart.yaml has no top-level "version:" key.');
  }
  let out = content.replace(versionRe, `version: ${version}`);

  if (appVersion) {
    const appRe = /^appVersion:[ \t]*.*$/m;
    if (appRe.test(out)) {
      out = out.replace(appRe, `appVersion: "${version}"`);
    } else {
      // appVersion is optional in Chart.yaml — add it next to version rather
      // than fail, so a chart created without one still gets an image tag.
      out = out.replace(versionRe, `version: ${version}\nappVersion: "${version}"`);
    }
  }
  return out;
};

// Applies the sync and returns the files to commit ([] when disabled).
export const syncChart = ({ chartInput, version, appVersion = true, dryRun = false }) => {
  const file = resolveChartFile(chartInput);
  if (!file) return [];
  const before = fs.readFileSync(file, 'utf8');
  const after = setChartVersion(before, version, { appVersion });
  if (!dryRun) fs.writeFileSync(file, after);
  return [file];
};
