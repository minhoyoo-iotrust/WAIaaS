/**
 * OpenClaw skill installer.
 *
 * Installs WAIaaS skill files to ~/.openclaw/skills/waiaas-{name}/SKILL.md
 * with OpenClaw-compatible frontmatter format.
 */

import os from "node:os";
import path from "node:path";
import { transformAndInstall, type ParsedFrontmatter } from "./transform.js";

/**
 * Transform WAIaaS frontmatter to OpenClaw format.
 *
 * OpenClaw uses a minimal frontmatter:
 * - name: lowercase hyphenated registry name
 * - description: kept as-is
 * - All other fields (category, tags, version, dispatch) removed
 */
function openClawTransform(
  original: ParsedFrontmatter,
  registryName: string,
): Record<string, unknown> {
  return {
    name: `waiaas-${registryName}`,
    description: original.description,
  };
}

/**
 * Install WAIaaS skills to OpenClaw skills directory.
 */
export function installOpenClawSkills(opts: { force: boolean }): void {
  const targetDir = path.join(os.homedir(), ".openclaw", "skills");

  console.log(`\nInstalling WAIaaS skills to ${targetDir}/\n`);

  const result = transformAndInstall({
    namePrefix: "waiaas-",
    targetDir,
    frontmatterTransform: openClawTransform,
    force: opts.force,
  });

  console.log(
    `\nDone: ${result.installed} installed, ${result.skipped} skipped.`,
  );

  if (result.installed > 0) {
    console.log(`
Add to ~/.openclaw/openclaw.json:

  {
    "skills": {
      "entries": {
        "waiaas-quickstart": {
          "env": {
            "WAIAAS_BASE_URL": "http://localhost:3100",
            "WAIAAS_MASTER_PASSWORD": "<your-master-password>",
            "WAIAAS_SESSION_TOKEN": "<your-session-token>"
          }
        }
      }
    }
  }
`);
  }
}
