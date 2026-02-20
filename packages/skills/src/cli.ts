#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { getSkillsDir, SKILL_REGISTRY } from "./registry.js";
import { installOpenClawSkills } from "./openclaw.js";
import { installClaudeCodeSkills } from "./claude-code.js";
import { installAgentSkills } from "./agent-skills.js";

const VERSION = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
).version as string;

function printHelp(): void {
  console.log(`
@waiaas/skills v${VERSION}
AI agent skill files for WAIaaS

Usage:
  npx @waiaas/skills <command> [options]

Commands:
  list              List all available skill files
  add <name>        Copy a skill file to the current directory
  add all           Copy all skill files to the current directory
  openclaw          Install skills to ~/.openclaw/skills/ (OpenClaw)
  claude-code       Install skills to .claude/skills/ (Claude Code)
  agent-skills      Install skills to .agents/skills/ (Codex, Gemini CLI, Goose, Amp)
                    --target cursor    Install to .cursor/skills/
                    --target github    Install to .github/skills/
  help              Show this help message

Options:
  --force           Overwrite existing files without warning
  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  npx @waiaas/skills list
  npx @waiaas/skills add quickstart
  npx @waiaas/skills add all
  npx @waiaas/skills openclaw
  npx @waiaas/skills claude-code
  npx @waiaas/skills agent-skills
  npx @waiaas/skills agent-skills --target cursor
`);
}

function printVersion(): void {
  console.log(`@waiaas/skills v${VERSION}`);
}

function listSkills(): void {
  console.log("\nAvailable skill files:\n");

  const maxNameLen = Math.max(...SKILL_REGISTRY.map((s) => s.name.length));

  for (const skill of SKILL_REGISTRY) {
    const paddedName = skill.name.padEnd(maxNameLen + 2);
    console.log(`  ${paddedName}${skill.description}`);
  }

  console.log(`\nTotal: ${SKILL_REGISTRY.length} skill files`);
  console.log('Run "npx @waiaas/skills add <name>" to add a skill file.\n');
}

function copySkill(
  name: string,
  destDir: string,
  force: boolean,
): { copied: boolean; skipped: boolean } {
  const entry = SKILL_REGISTRY.find((s) => s.name === name);
  if (!entry) {
    const available = SKILL_REGISTRY.map((s) => s.name).join(", ");
    console.error(`Error: Unknown skill "${name}".`);
    console.error(`Available skills: ${available}`);
    process.exit(1);
  }

  const srcPath = path.join(getSkillsDir(), entry.filename);
  const destPath = path.join(destDir, entry.filename);

  if (fs.existsSync(destPath) && !force) {
    console.log(`  SKIP  ${entry.filename} (already exists, use --force to overwrite)`);
    return { copied: false, skipped: true };
  }

  fs.copyFileSync(srcPath, destPath);
  console.log(`  COPY  ${entry.filename}`);
  return { copied: true, skipped: false };
}

function addSkills(names: string[], force: boolean): void {
  const destDir = process.cwd();
  let copiedCount = 0;
  let skippedCount = 0;

  for (const name of names) {
    const result = copySkill(name, destDir, force);
    if (result.copied) copiedCount++;
    if (result.skipped) skippedCount++;
  }

  console.log(
    `\nDone: ${copiedCount} copied, ${skippedCount} skipped.`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filteredArgs = args.filter(
    (a) => a !== "--force" && a !== "--help" && a !== "-h" && a !== "--version" && a !== "-v" && !a.startsWith("--target"),
  );

  // Handle flags
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    printVersion();
    process.exit(0);
  }

  // Parse --target option
  const targetIdx = args.indexOf("--target");
  const targetValue = targetIdx >= 0 ? args[targetIdx + 1] : undefined;

  const command = filteredArgs[0];

  switch (command) {
    case "list":
    case undefined: {
      listSkills();
      break;
    }

    case "add": {
      const target = filteredArgs[1];
      if (!target) {
        console.error("Error: Please specify a skill name or 'all'.");
        console.error('Usage: npx @waiaas/skills add <name|all>');
        process.exit(1);
      }

      if (target === "all") {
        addSkills(
          SKILL_REGISTRY.map((s) => s.name),
          force,
        );
      } else {
        addSkills([target], force);
      }
      break;
    }

    case "openclaw": {
      installOpenClawSkills({ force });
      break;
    }

    case "claude-code": {
      installClaudeCodeSkills({ force });
      break;
    }

    case "agent-skills": {
      installAgentSkills({ force, target: targetValue });
      break;
    }

    case "help": {
      printHelp();
      break;
    }

    default: {
      console.error(`Error: Unknown command "${command}".`);
      console.error('Run "npx @waiaas/skills help" for available commands.');
      process.exit(1);
    }
  }
}

main();
