// Thin wrappers around git, using the credentials set up by actions/checkout.
import { execFileSync } from 'node:child_process';

const git = (args) => execFileSync('git', args, { stdio: 'inherit' });

export const configUser = (name, email) => {
  git(['config', 'user.name', name]);
  git(['config', 'user.email', email]);
};

export const commit = (message, files) => {
  git(['add', '--', ...files]);
  git(['commit', '-m', message]);
};

export const tag = (name) => git(['tag', name]);
export const forceTag = (name) => git(['tag', '-f', name]);
export const push = () => git(['push']);
export const pushTag = (name) => git(['push', 'origin', name]);
export const forcePushTag = (name) => git(['push', '-f', 'origin', name]);

const read = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// True when the remote branch is no longer the commit the release was built on
// (HEAD~1, the release commit's parent): a push would then be rejected. Asked
// with ls-remote, so it needs no fetch refspec. A detached HEAD is never "moved".
export const branchMoved = () => {
  const branch = read(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === 'HEAD') return false;
  const remote = read(['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s/)[0];
  return remote !== read(['rev-parse', 'HEAD~1']);
};
