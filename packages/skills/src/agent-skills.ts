/**
 * Agent Skills standard installer.
 *
 * Installs WAIaaS skill files to the Agent Skills open standard directory
 * structure. Compatible with 27+ platforms including OpenAI Codex, Gemini CLI,
 * Cursor, GitHub Copilot, Goose, Amp, and Roo Code.
 *
 * Default target: .agents/skills/waiaas-{name}/SKILL.md
 * Alternative targets: --target cursor (.cursor/skills/), --target github (.github/skills/)
 */

import path from "node:path";
import { transformAndInstall, type ParsedFrontmatter } from "./transform.js";

/** Supported target platforms and their directory paths. */
const TARGET_DIRS: Record<string, string> = {
  default: ".agents/skills",
  cursor: ".cursor/skills",
  github: ".github/skills",
};

/**
 * Transform WAIaaS frontmatter to Agent Skills standard format.
 *
 * Agent Skills standard uses:
 * - name: lowercase hyphenated registry name
 * - description: kept as-is
 * - allowed-tools: derived from dispatch.allowedCommands
 * - metadata: category, tags, version moved here
 */
function agentSkillsTransform(
  original: ParsedFrontmatter,
  registryName: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: `waiaas-${registryName}`,
    description: original.description,
  };

  // Convert dispatch.allowedCommands to allowed-tools format
  if (original.dispatch?.allowedCommands?.length) {
    const tools = original.dispatch.allowedCommands
      .map((cmd) => `Bash(${cmd}:*)`)
      .join(", ");
    result["allowed-tools"] = tools;
  }

  // Move category, tags, version to metadata
  const metadata: Record<string, unknown> = {};
  if (original.category) metadata.category = original.category;
  if (original.tags?.length) metadata.tags = original.tags;
  if (original.version) metadata.version = original.version;

  if (Object.keys(metadata).length > 0) {
    result.metadata = metadata;
  }

  return result;
}

/**
 * Install WAIaaS skills to Agent Skills standard directory.
 */
export function installAgentSkills(opts: {
  force: boolean;
  target?: string;
}): void {
  const targetKey = opts.target ?? "default";
  const relDir = TARGET_DIRS[targetKey];

  if (!relDir) {
    const validTargets = Object.keys(TARGET_DIRS)
      .filter((k) => k !== "default")
      .join(", ");
    console.error(
      `Error: Unknown target "${opts.target}". Valid targets: ${validTargets}`,
    );
    console.error("  Omit --target to use the default (.agents/skills/)");
    process.exit(1);
  }

  const targetDir = path.join(process.cwd(), relDir);

  const targetLabel =
    targetKey === "default"
      ? "(Codex, Gemini CLI, Goose, Amp)"
      : `(${targetKey})`;

  console.log(
    `\nInstalling WAIaaS skills to ${targetDir}/ ${targetLabel}\n`,
  );

  const result = transformAndInstall({
    namePrefix: "waiaas-",
    targetDir,
    frontmatterTransform: agentSkillsTransform,
    force: opts.force,
  });

  console.log(
    `\nDone: ${result.installed} installed, ${result.skipped} skipped.`,
  );

  if (result.installed > 0) {
    console.log(`
Skills are now available for Agent Skills-compatible platforms.
Your AI agent will automatically discover them in ${relDir}/.
`);
  }
}
