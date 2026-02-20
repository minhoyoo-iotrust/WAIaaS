/**
 * Common skill file transformation utilities.
 *
 * Shared by openclaw, claude-code, and agent-skills installers.
 * Reads WAIaaS .skill.md files, transforms frontmatter, and writes
 * to platform-specific directory structures.
 */

import fs from "node:fs";
import path from "node:path";
import { getSkillsDir, SKILL_REGISTRY, type SkillEntry } from "./registry.js";

export interface ParsedFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly category?: string;
  readonly tags?: string[];
  readonly version?: string;
  readonly dispatch?: {
    readonly kind?: string;
    readonly allowedCommands?: string[];
  };
}

export interface ParsedSkillFile {
  readonly frontmatter: ParsedFrontmatter;
  readonly body: string;
}

export interface TransformOptions {
  /** Directory prefix for skill subdirectories (e.g., "waiaas-") */
  readonly namePrefix: string;
  /** Absolute path to install destination */
  readonly targetDir: string;
  /** Transform original frontmatter to platform-specific format */
  readonly frontmatterTransform: (
    original: ParsedFrontmatter,
    registryName: string,
  ) => Record<string, unknown>;
  /** Whether to overwrite existing files */
  readonly force: boolean;
}

/**
 * Parse a YAML frontmatter block from a skill file.
 * Simple parser that handles the WAIaaS skill file format.
 */
export function parseFrontmatter(content: string): ParsedSkillFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: { name: "", description: "" },
      body: content,
    };
  }

  const yamlBlock = match[1]!;
  const body = match[2]!;

  // Simple YAML parsing for known fields
  const fm: Record<string, unknown> = {};

  const nameMatch = yamlBlock.match(/^name:\s*"(.+)"$/m);
  if (nameMatch) fm.name = nameMatch[1];

  const descMatch = yamlBlock.match(/^description:\s*"(.+)"$/m);
  if (descMatch) fm.description = descMatch[1];

  const catMatch = yamlBlock.match(/^category:\s*"(.+)"$/m);
  if (catMatch) fm.category = catMatch[1];

  const versionMatch = yamlBlock.match(/^version:\s*"(.+)"$/m);
  if (versionMatch) fm.version = versionMatch[1];

  const tagsMatch = yamlBlock.match(/^tags:\s*\[(.+)\]$/m);
  if (tagsMatch) {
    fm.tags = tagsMatch[1]!.split(",").map((t) => t.trim());
  }

  // Parse dispatch block
  const dispatchKindMatch = yamlBlock.match(/^\s+kind:\s*"(.+)"$/m);
  const allowedCmdsMatch = yamlBlock.match(/^\s+allowedCommands:\s*\[(.+)\]$/m);
  if (dispatchKindMatch || allowedCmdsMatch) {
    fm.dispatch = {
      kind: dispatchKindMatch?.[1],
      allowedCommands: allowedCmdsMatch
        ? allowedCmdsMatch[1]!.split(",").map((c) => c.trim().replace(/"/g, ""))
        : undefined,
    };
  }

  return {
    frontmatter: {
      name: (fm.name as string) ?? "",
      description: (fm.description as string) ?? "",
      category: fm.category as string | undefined,
      tags: fm.tags as string[] | undefined,
      version: fm.version as string | undefined,
      dispatch: fm.dispatch as ParsedFrontmatter["dispatch"],
    },
    body,
  };
}

/**
 * Serialize a frontmatter object to YAML string.
 * Only includes non-undefined values.
 */
export function serializeFrontmatter(
  data: Record<string, unknown>,
): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    if (typeof value === "string") {
      // allowed-tools uses special syntax like Bash(curl:*) that should not be quoted
      const isToolSpec = key === "allowed-tools";
      const needsQuoting =
        !isToolSpec &&
        (value.includes(":") || value.includes("#") || value.includes('"'));
      if (needsQuoting) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${key}:`);
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        if (subVal === undefined) continue;
        if (typeof subVal === "string") {
          lines.push(`  ${subKey}: ${subVal}`);
        } else if (Array.isArray(subVal)) {
          lines.push(`  ${subKey}: [${subVal.join(", ")}]`);
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Transform and install all WAIaaS skill files to a target platform directory.
 */
export function transformAndInstall(opts: TransformOptions): {
  installed: number;
  skipped: number;
} {
  const skillsDir = getSkillsDir();
  let installed = 0;
  let skipped = 0;

  // Ensure target directory exists
  fs.mkdirSync(opts.targetDir, { recursive: true });

  for (const entry of SKILL_REGISTRY) {
    const srcPath = path.join(skillsDir, entry.filename);
    const dirName = `${opts.namePrefix}${entry.name}`;
    const destDir = path.join(opts.targetDir, dirName);
    const destPath = path.join(destDir, "SKILL.md");

    // Check if already exists
    if (fs.existsSync(destPath) && !opts.force) {
      console.log(`  SKIP  ${dirName}/SKILL.md (already exists, use --force to overwrite)`);
      skipped++;
      continue;
    }

    // Read source
    const content = fs.readFileSync(srcPath, "utf-8");
    const parsed = parseFrontmatter(content);

    // Transform frontmatter
    const transformedFm = opts.frontmatterTransform(parsed.frontmatter, entry.name);
    const fmYaml = serializeFrontmatter(transformedFm);

    // Write to target
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destPath, `---\n${fmYaml}\n---\n${parsed.body}`);
    console.log(`  INSTALL  ${dirName}/SKILL.md`);
    installed++;
  }

  return { installed, skipped };
}

/**
 * Map WAIaaS skill name to a registry-style name.
 */
export function toRegistryName(entry: SkillEntry): string {
  return entry.name;
}
