#!/bin/sh
set -e

# =============================================================================
# WAIaaS Docker Entrypoint
#
# Handles _FILE pattern for Docker Secrets:
#   WAIAAS_MASTER_PASSWORD_FILE=/run/secrets/master_password
#   -> reads file content into WAIAAS_MASTER_PASSWORD env var
#
# Then exec's node to replace shell as PID 1 (proper signal handling).
# =============================================================================

# ---------------------------------------------------------------------------
# file_env: Read _FILE env var into the base env var
# ---------------------------------------------------------------------------
file_env() {
  var="$1"
  fileVar="${var}_FILE"
  val=""
  fileVal=""

  eval val="\${$var:-}"
  eval fileVal="\${$fileVar:-}"

  if [ -n "$val" ] && [ -n "$fileVal" ]; then
    echo "ERROR: Both $var and $fileVar are set. Use only one." >&2
    exit 1
  fi

  if [ -n "$fileVal" ]; then
    if [ ! -r "$fileVal" ]; then
      echo "ERROR: $fileVar=$fileVal is not readable" >&2
      exit 1
    fi
    val="$(cat "$fileVal")"
    export "$var"="$val"
    unset "$fileVar"
  fi
}

# ---------------------------------------------------------------------------
# Process supported _FILE environment variables
# ---------------------------------------------------------------------------
file_env WAIAAS_MASTER_PASSWORD
file_env WAIAAS_TELEGRAM_BOT_TOKEN
file_env WAIAAS_NOTIFICATIONS_TELEGRAM_BOT_TOKEN

echo "WAIaaS daemon starting..."
echo "Data directory: ${WAIAAS_DATA_DIR:-/data}"

# exec replaces shell with node process (PID 1 = node, receives SIGTERM directly)
exec node /app/packages/cli/dist/index.js start --data-dir "${WAIAAS_DATA_DIR:-/data}"
