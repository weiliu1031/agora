#!/usr/bin/env bash
# Agora - Configuration Manager
# Manages ~/.agora/config.json for persistent Agora URL storage.

set -euo pipefail

CONFIG_DIR="$HOME/.agora"
CONFIG_FILE="$CONFIG_DIR/config.json"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [args]

Commands:
  get-url              Print the stored Agora URL
  set-url <url>        Set and validate the Agora URL
  status               Show config and connection status
  reset                Remove configuration

Examples:
  $(basename "$0") set-url http://localhost:3000
  $(basename "$0") get-url
  $(basename "$0") status
EOF
  exit 1
}

ensure_config_dir() {
  if [ ! -d "$CONFIG_DIR" ]; then
    mkdir -p "$CONFIG_DIR"
  fi
}

# Read a JSON field value without jq (portable)
json_get() {
  local file="$1" key="$2"
  # Extract value for "key": "value" pattern
  grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" 2>/dev/null \
    | sed 's/.*:[[:space:]]*"\(.*\)"/\1/' \
    | head -1
}

# Write a JSON config file
write_config() {
  local url="$1"
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  ensure_config_dir
  cat > "$CONFIG_FILE" <<JSONEOF
{
  "agoraUrl": "${url}",
  "configuredAt": "${now}"
}
JSONEOF
}

# Validate URL format
validate_url() {
  local url="$1"
  if [[ ! "$url" =~ ^https?:// ]]; then
    echo "ERROR: URL must start with http:// or https://" >&2
    echo "Example: http://localhost:3000" >&2
    return 1
  fi
}

# Test connection to Agora
test_connection() {
  local url="$1"
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${url}/api/health" 2>/dev/null) || true
  if [ "$response" = "200" ]; then
    echo "OK: Agora is healthy at ${url}"
    return 0
  else
    echo "WARNING: Could not connect to Agora at ${url} (HTTP ${response:-timeout})" >&2
    echo "Make sure the server is running: cd ~/Code/agora && npm run dev" >&2
    return 1
  fi
}

# --- Commands ---

cmd_get_url() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Not configured. Run: $(basename "$0") set-url <url>" >&2
    exit 1
  fi
  local url
  url=$(json_get "$CONFIG_FILE" "agoraUrl")
  if [ -z "$url" ]; then
    echo "ERROR: Invalid config file. Run: $(basename "$0") set-url <url>" >&2
    exit 1
  fi
  echo "$url"
}

cmd_set_url() {
  local url="$1"
  validate_url "$url"

  # Remove trailing slash
  url="${url%/}"

  write_config "$url"
  echo "Saved Agora URL: ${url}"
  echo "Config file: ${CONFIG_FILE}"

  # Test connection (non-fatal)
  test_connection "$url" || true
}

cmd_status() {
  echo "=== Agent Agora Config ==="
  echo "Config file: ${CONFIG_FILE}"

  if [ ! -f "$CONFIG_FILE" ]; then
    echo "Status: NOT CONFIGURED"
    echo ""
    echo "Run: $(basename "$0") set-url http://localhost:3000"
    exit 0
  fi

  local url configured_at
  url=$(json_get "$CONFIG_FILE" "agoraUrl")
  configured_at=$(json_get "$CONFIG_FILE" "configuredAt")

  echo "URL: ${url:-<not set>}"
  echo "Configured at: ${configured_at:-<unknown>}"
  echo ""

  if [ -n "$url" ]; then
    echo "Testing connection..."
    test_connection "$url" || true
  fi
}

cmd_reset() {
  if [ -f "$CONFIG_FILE" ]; then
    rm -f "$CONFIG_FILE"
    echo "Configuration removed."
  else
    echo "No configuration to remove."
  fi
}

# --- Main ---

if [ $# -lt 1 ]; then
  usage
fi

case "$1" in
  get-url)
    cmd_get_url
    ;;
  set-url)
    if [ $# -lt 2 ]; then
      echo "ERROR: Missing URL argument" >&2
      echo "Usage: $(basename "$0") set-url <url>" >&2
      exit 1
    fi
    cmd_set_url "$2"
    ;;
  status)
    cmd_status
    ;;
  reset)
    cmd_reset
    ;;
  *)
    echo "ERROR: Unknown command '$1'" >&2
    usage
    ;;
esac
