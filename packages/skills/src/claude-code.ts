/**
 * Claude Code skill installer.
 *
 * Installs WAIaaS skill files to .claude/skills/waiaas-{name}/SKILL.md
 * with Claude Code-compatible frontmatter format.
 */

import path from "node:path";
import { transformAndInstall, type ParsedFrontmatter } from "./transform.js";

/**
 * Transform WAIaaS frontmatter to Claude Code format.
 *
 * Claude Code uses:
 * - name: lowercase hyphenated registry name
 * - description: kept as-is
 * - allowed-tools: derived from dispatch.allowedCommands
 * - All other fields (category, tags, version, dispatch) removed
 */
function claudeCodeTransform(
  original: ParsedFrontmatter,
  registryName: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: `waiaas-${registryName}`,
    description: original.description,
  };

  // Convert dispatch.allowedCommands to Claude Code allowed-tools format
  if (original.dispatch?.allowedCommands?.length) {
    const tools = original.dispatch.allowedCommands
      .map((cmd) => `Bash(${cmd}:*)`)
      .join(", ");
    result["allowed-tools"] = tools;
  }

  return result;
}

/**
 * Install WAIaaS skills to Claude Code skills directory.
 */
export function installClaudeCodeSkills(opts: { force: boolean }): void {
  const targetDir = path.join(process.cwd(), ".claude", "skills");

  console.log(`\nInstalling WAIaaS skills to ${targetDir}/\n`);

  const result = transformAndInstall({
    namePrefix: "waiaas-",
    targetDir,
    frontmatterTransform: claudeCodeTransform,
    force: opts.force,
  });

  console.log(
    `\nDone: ${result.installed} installed, ${result.skipped} skipped.`,
  );

  if (result.installed > 0) {
    console.log(`
Skills are now available in Claude Code.
Use slash commands like /waiaas-quickstart or let Claude Code discover them automatically.

Alternative: Connect WAIaaS via MCP for direct tool access:
  waiaas mcp setup
`);
  }
}
