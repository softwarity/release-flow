// Release-notes markdown parsing and mutation.
import fs from 'node:fs';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Create the file with a single placeholder section if it does not exist.
// Returns true if it was created.
export const ensureFile = (path, placeholder) => {
  if (fs.existsSync(path)) return false;
  fs.writeFileSync(path, `# Release Notes\n\n## ${placeholder}\n\n---\n`);
  return true;
};

// Rename the "## <placeholder>" heading to "## <version>" and extract its body
// (everything up to the next "## " heading, minus a trailing "---" and blanks).
// Returns { content, body }.
export const resolveSection = (content, placeholder, version) => {
  const lines = content.split('\n');
  const headRe = new RegExp(`^##\\s+${escapeRe(placeholder)}\\s*$`, 'i');
  const idx = lines.findIndex((l) => headRe.test(l));
  if (idx === -1) {
    throw new Error(
      `Placeholder heading "## ${placeholder}" not found in the notes file. ` +
        `Add it under the "# Release Notes" title — that is the section contributors fill in.`
    );
  }

  let end = idx + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;

  let body = lines.slice(idx + 1, end);
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  if (body.length && /^-{3,}\s*$/.test(body[body.length - 1])) body.pop();
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  while (body.length && body[0].trim() === '') body.shift();

  lines[idx] = `## ${version}`;
  return { content: lines.join('\n'), body: body.join('\n').trim() };
};

// Insert a fresh empty placeholder section just after the first H1 ("# ...").
// Mirrors the existing layout: "# Title\n\n## <placeholder>\n\n---".
export const insertPlaceholder = (content, placeholder) => {
  let done = false;
  const out = content.replace(/^(#\s+.+)$/m, (m) => {
    if (done) return m;
    done = true;
    return `${m}\n\n## ${placeholder}\n\n---`;
  });
  if (done) return out;
  // No H1 found — prepend the placeholder at the very top.
  return `## ${placeholder}\n\n---\n\n${content}`;
};
