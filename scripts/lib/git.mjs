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
export const push = () => git(['push']);
export const pushTag = (name) => git(['push', 'origin', name]);
