/**
 * Docker Platform Tests (PLAT-02): 18 scenarios
 *
 * Validates Docker deployment configuration by parsing Dockerfile, docker-compose.yml,
 * docker-compose.secrets.yml, and docker/entrypoint.sh as plain text.
 * No actual Docker daemon required -- CI-safe file parsing tests.
 *
 * Categories:
 *   Build (2)      - Multi-stage build structure
 *   Compose (2)    - Service config, healthcheck
 *   Volume (2)     - Named volume, data dir
 *   Env (2)        - Environment variables, env_file
 *   Hostname (1)   - Container network binding
 *   Grace (2)      - PID 1 exec, entrypoint chain
 *   Secrets (2)    - file_env function, secrets overlay
 *   Healthcheck (2) - Dockerfile + compose healthcheck parity
 *   Non-root (2)   - User creation, directory ownership
 *   Auto-init (1)  - start --data-dir command
 *
 * @see Dockerfile
 * @see docker-compose.yml
 * @see docker-compose.secrets.yml
 * @see docker/entrypoint.sh
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Load Docker files as plain text
// ---------------------------------------------------------------------------

const projectRoot = resolve(__dirname, '../../../../..');
const dockerfile = readFileSync(resolve(projectRoot, 'Dockerfile'), 'utf-8');
const dockerCompose = readFileSync(resolve(projectRoot, 'docker-compose.yml'), 'utf-8');
const dockerComposeSecrets = readFileSync(resolve(projectRoot, 'docker-compose.secrets.yml'), 'utf-8');
const entrypoint = readFileSync(resolve(projectRoot, 'docker/entrypoint.sh'), 'utf-8');

// ---------------------------------------------------------------------------
// Build (2)
// ---------------------------------------------------------------------------

describe('PLAT-02 Docker Platform Tests', () => {
  describe('Build', () => {
    it('PLAT-02-BUILD-01: Dockerfile has 2-stage build (builder + runner)', () => {
      // Stage 1: builder
      expect(dockerfile).toMatch(/FROM\s+node:22-slim\s+AS\s+builder/);
      // Stage 2: runner
      expect(dockerfile).toMatch(/FROM\s+node:22-slim\s+AS\s+runner/);

      // builder uses full install
      expect(dockerfile).toMatch(/pnpm install --frozen-lockfile/);
      // runner uses prod install
      expect(dockerfile).toMatch(/pnpm install --frozen-lockfile --prod/);
    });

    it('PLAT-02-BUILD-02: runner stage excludes devDependencies and src directories', () => {
      // Split Dockerfile into stages
      const runnerStageStart = dockerfile.indexOf('FROM node:22-slim AS runner');
      expect(runnerStageStart).toBeGreaterThan(0);
      const runnerStage = dockerfile.slice(runnerStageStart);

      // --prod flag in runner stage
      expect(runnerStage).toContain('--prod');

      // COPY --from=builder copies dist directories, not src
      const copyFromBuilder = runnerStage.match(/COPY\s+--from=builder\s+[^\n]+/g) ?? [];
      expect(copyFromBuilder.length).toBeGreaterThan(0);

      // dist directories are copied
      const distCopies = copyFromBuilder.filter((line) => line.includes('/dist'));
      expect(distCopies.length).toBeGreaterThan(0);

      // src directories are NOT copied in runner stage
      const srcCopies = copyFromBuilder.filter(
        (line) => /\/src\s/.test(line) || line.endsWith('/src'),
      );
      expect(srcCopies).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Compose (2)
  // -----------------------------------------------------------------------

  describe('Compose', () => {
    it('PLAT-02-COMPOSE-01: docker-compose.yml has waiaas-daemon service with correct port and restart policy', () => {
      expect(dockerCompose).toContain('waiaas-daemon');
      expect(dockerCompose).toMatch(/127\.0\.0\.1:3100:3100/);
      expect(dockerCompose).toMatch(/restart:\s*unless-stopped/);
    });

    it('PLAT-02-COMPOSE-02: docker-compose.yml healthcheck uses /health endpoint with correct intervals', () => {
      // healthcheck test may use CMD array or string format
      expect(dockerCompose).toMatch(/curl.*-f.*http:\/\/localhost:3100\/health/);
      expect(dockerCompose).toMatch(/interval:\s*30s/);
      expect(dockerCompose).toMatch(/retries:\s*3/);
    });
  });

  // -----------------------------------------------------------------------
  // Volume (2)
  // -----------------------------------------------------------------------

  describe('Volume', () => {
    it('PLAT-02-VOL-01: docker-compose.yml mounts waiaas-data named volume at /data', () => {
      // Named volume definition
      expect(dockerCompose).toMatch(/volumes:\s*\n\s+waiaas-data:/m);
      // Volume mount in service
      expect(dockerCompose).toMatch(/waiaas-data:\/data/);
    });

    it('PLAT-02-VOL-02: Dockerfile sets WAIAAS_DATA_DIR=/data', () => {
      expect(dockerfile).toMatch(/ENV\s+WAIAAS_DATA_DIR=\/data/);
    });
  });

  // -----------------------------------------------------------------------
  // Env (2)
  // -----------------------------------------------------------------------

  describe('Env', () => {
    it('PLAT-02-ENV-01: Dockerfile sets NODE_ENV=production, WAIAAS_DAEMON_HOSTNAME=0.0.0.0, WAIAAS_DATA_DIR=/data', () => {
      expect(dockerfile).toMatch(/ENV\s+NODE_ENV=production/);
      expect(dockerfile).toMatch(/ENV\s+WAIAAS_DAEMON_HOSTNAME=0\.0\.0\.0/);
      expect(dockerfile).toMatch(/ENV\s+WAIAAS_DATA_DIR=\/data/);
    });

    it('PLAT-02-ENV-02: docker-compose.yml uses env_file with required: false', () => {
      expect(dockerCompose).toContain('env_file:');
      expect(dockerCompose).toMatch(/path:\s*\.env/);
      expect(dockerCompose).toMatch(/required:\s*false/);
    });
  });

  // -----------------------------------------------------------------------
  // Hostname (1)
  // -----------------------------------------------------------------------

  describe('Hostname', () => {
    it('PLAT-02-HOST-01: WAIAAS_DAEMON_HOSTNAME=0.0.0.0 allows container external access', () => {
      // Dockerfile sets 0.0.0.0 for container binding
      expect(dockerfile).toMatch(/WAIAAS_DAEMON_HOSTNAME=0\.0\.0\.0/);
      // docker-compose also sets it
      expect(dockerCompose).toMatch(/WAIAAS_DAEMON_HOSTNAME=0\.0\.0\.0/);
    });
  });

  // -----------------------------------------------------------------------
  // Grace (2)
  // -----------------------------------------------------------------------

  describe('Graceful Shutdown', () => {
    it('PLAT-02-GRACE-01: entrypoint.sh uses exec for PID 1 signal handling', () => {
      // exec replaces shell with node process
      expect(entrypoint).toMatch(/^exec\s+node/m);
    });

    it('PLAT-02-GRACE-02: Dockerfile ENTRYPOINT runs entrypoint.sh which starts daemon with --data-dir', () => {
      // Dockerfile sets entrypoint
      expect(dockerfile).toMatch(/ENTRYPOINT\s+\["\/app\/entrypoint\.sh"\]/);
      // entrypoint.sh executes waiaas start
      expect(entrypoint).toMatch(/node\s+.*start\s+--data-dir/);
    });
  });

  // -----------------------------------------------------------------------
  // Secrets (2)
  // -----------------------------------------------------------------------

  describe('Secrets', () => {
    it('PLAT-02-SEC-01: entrypoint.sh file_env processes 3 secret variables', () => {
      // file_env function exists
      expect(entrypoint).toMatch(/file_env\(\)/);

      // 3 secret variables processed
      expect(entrypoint).toMatch(/file_env\s+WAIAAS_MASTER_PASSWORD/);
      expect(entrypoint).toMatch(/file_env\s+WAIAAS_TELEGRAM_BOT_TOKEN/);
      expect(entrypoint).toMatch(/file_env\s+WAIAAS_NOTIFICATIONS_TELEGRAM_BOT_TOKEN/);
    });

    it('PLAT-02-SEC-02: docker-compose.secrets.yml defines secrets with /run/secrets/ paths', () => {
      // Secret definitions
      expect(dockerComposeSecrets).toContain('waiaas_master_password');
      expect(dockerComposeSecrets).toContain('waiaas_telegram_bot_token');

      // _FILE env vars pointing to /run/secrets/
      expect(dockerComposeSecrets).toMatch(
        /WAIAAS_MASTER_PASSWORD_FILE=\/run\/secrets\/waiaas_master_password/,
      );
      expect(dockerComposeSecrets).toMatch(
        /WAIAAS_TELEGRAM_BOT_TOKEN_FILE=\/run\/secrets\/waiaas_telegram_bot_token/,
      );

      // File-based secret sources
      expect(dockerComposeSecrets).toMatch(/file:\s*\.\/secrets\/master_password\.txt/);
      expect(dockerComposeSecrets).toMatch(/file:\s*\.\/secrets\/telegram_bot_token\.txt/);
    });
  });

  // -----------------------------------------------------------------------
  // Healthcheck (2)
  // -----------------------------------------------------------------------

  describe('Healthcheck', () => {
    it('PLAT-02-HC-01: Dockerfile HEALTHCHECK has correct timing parameters', () => {
      expect(dockerfile).toMatch(/HEALTHCHECK\s+--interval=30s/);
      expect(dockerfile).toMatch(/--timeout=5s/);
      expect(dockerfile).toMatch(/--start-period=10s/);
      expect(dockerfile).toMatch(/--retries=3/);
    });

    it('PLAT-02-HC-02: Dockerfile and docker-compose.yml healthchecks use same /health endpoint', () => {
      // Dockerfile healthcheck
      const dockerfileHealthUrl = dockerfile.match(
        /curl\s+-f\s+(http:\/\/localhost:\d+\/health)/,
      );
      expect(dockerfileHealthUrl).not.toBeNull();

      // docker-compose healthcheck
      const composeHealthUrl = dockerCompose.match(
        /curl.*-f.*(http:\/\/localhost:\d+\/health)/,
      );
      expect(composeHealthUrl).not.toBeNull();

      // Both use the same URL
      expect(dockerfileHealthUrl![1]).toBe(composeHealthUrl![1]);
    });
  });

  // -----------------------------------------------------------------------
  // Non-root (2)
  // -----------------------------------------------------------------------

  describe('Non-root', () => {
    it('PLAT-02-NONROOT-01: Dockerfile creates waiaas user with UID 1001', () => {
      expect(dockerfile).toMatch(/USER\s+waiaas/);
      expect(dockerfile).toMatch(/useradd\s+-u\s+1001\s+-g\s+waiaas/);
    });

    it('PLAT-02-NONROOT-02: Dockerfile sets ownership of /data and /app to waiaas', () => {
      expect(dockerfile).toMatch(/chown\s+-R\s+waiaas:waiaas\s+\/data\s+\/app/);
    });
  });

  // -----------------------------------------------------------------------
  // Auto-init (1)
  // -----------------------------------------------------------------------

  describe('Auto-init', () => {
    it('PLAT-02-AUTOINIT-01: entrypoint.sh runs "start --data-dir" command for auto-init', () => {
      // The entrypoint runs 'start' with --data-dir which handles init if needed
      expect(entrypoint).toMatch(/start\s+--data-dir\s+"\$\{WAIAAS_DATA_DIR/);
    });
  });
});
