// Runs the caller's publish command between "tag" and "push".
// The command goes through bash -e -o pipefail, so a multi-line script stops at
// its first failing line; RELEASE_VERSION and RELEASE_TAG are exported to it.
import { spawnSync } from 'node:child_process';

export const runPublish = ({ command, version, tag, stdio = 'inherit' }) => {
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    stdio,
    env: { ...process.env, RELEASE_VERSION: version, RELEASE_TAG: tag },
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(
      `publish failed (exit ${r.status ?? r.signal}) — nothing was pushed: no tag, no release, no commit on the remote.`
    );
  }
};
