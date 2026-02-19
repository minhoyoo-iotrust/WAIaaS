import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const skillsDir = join(root, 'skills');

for (const file of readdirSync(skillsDir)) {
  if (!file.endsWith('.skill.md')) continue;
  const filePath = join(skillsDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const updated = content.replace(/^version:\s*".*"$/m, `version: "${version}"`);
  if (content !== updated) {
    writeFileSync(filePath, updated);
    console.log(`  SYNC  ${file} -> v${version}`);
  }
}
