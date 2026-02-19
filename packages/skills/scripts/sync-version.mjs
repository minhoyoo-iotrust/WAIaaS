import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

function syncSkillsDir(dir, label) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.skill.md')) continue;
    const filePath = join(dir, file);
    const content = readFileSync(filePath, 'utf-8');
    const updated = content.replace(/^version:\s*".*"$/m, `version: "${version}"`);
    if (content !== updated) {
      writeFileSync(filePath, updated);
      console.log(`  SYNC  ${label}${file} -> v${version}`);
    }
  }
}

// Sync packages/skills/skills/ (existing behavior)
const skillsDir = join(root, 'skills');
syncSkillsDir(skillsDir, '');

// Sync root skills/ directory
const rootSkillsDir = join(root, '..', '..', 'skills');
if (existsSync(rootSkillsDir)) {
  syncSkillsDir(rootSkillsDir, '(root) ');
}
