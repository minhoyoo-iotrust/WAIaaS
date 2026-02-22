import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8'));

// Root skills/ is SSoT — copy to packages/skills/skills/ then apply version
const rootSkillsDir = join(pkgRoot, '..', '..', 'skills');
const localSkillsDir = join(pkgRoot, 'skills');

if (!existsSync(rootSkillsDir)) {
  console.error('ERROR: Root skills/ directory not found at', rootSkillsDir);
  process.exit(1);
}

// Ensure local skills/ dir exists
if (!existsSync(localSkillsDir)) {
  mkdirSync(localSkillsDir, { recursive: true });
}

// Step 1: Copy all *.skill.md from root skills/ to packages/skills/skills/
const skillFiles = readdirSync(rootSkillsDir).filter((f) => f.endsWith('.skill.md'));

for (const file of skillFiles) {
  const src = join(rootSkillsDir, file);
  const dest = join(localSkillsDir, file);
  copyFileSync(src, dest);
  console.log(`  COPY  skills/${file} -> packages/skills/skills/${file}`);
}

// Step 2: Apply version string replacement on copied files
for (const file of skillFiles) {
  const filePath = join(localSkillsDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const updated = content.replace(/^version:\s*".*"$/m, `version: "${version}"`);
  if (content !== updated) {
    writeFileSync(filePath, updated);
    console.log(`  VERSION  ${file} -> v${version}`);
  }
}

console.log(`\nSynced ${skillFiles.length} skill files with version ${version}`);
