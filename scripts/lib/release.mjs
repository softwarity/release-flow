// Create a GitHub Release via the gh CLI (preinstalled on GitHub runners).
// Authenticates through the GH_TOKEN env var set by action.yml.
import { execFileSync } from 'node:child_process';

export const createRelease = ({ tag, title, bodyFile, draft, prerelease }) => {
  const args = ['release', 'create', tag, '--title', title, '--notes-file', bodyFile, '--verify-tag'];
  if (draft) args.push('--draft');
  if (prerelease) args.push('--prerelease');
  const out = execFileSync('gh', args, { encoding: 'utf8' });
  // gh prints the release URL as the last line of stdout.
  return out.trim().split('\n').pop();
};
