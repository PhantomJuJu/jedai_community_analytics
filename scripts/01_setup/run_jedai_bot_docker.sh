#!/usr/bin/env bash
# Rebuild image and run jedai-bot with --env-file (secrets stay out of shell history).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${JEDAI_BOT_ENV_FILE:-$REPO_ROOT/jedai-bot.env}"
IMAGE="${JEDAI_DOCKER_IMAGE:-jedai-app}"
CONTAINER="${JEDAI_BOT_CONTAINER:-jedai-bot}"

usage() {
  echo "Usage: $0 [--no-build]"
  echo "  Expects env file at: $ENV_FILE"
  echo "  Override path: JEDAI_BOT_ENV_FILE=/path/to/file $0"
  exit 1
}

DO_BUILD=1
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
fi
if [[ "${1:-}" == "--no-build" ]]; then
  DO_BUILD=0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Copy jedai-bot.env.example to jedai-bot.env and set values."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required to run Docker on this host."
  exit 1
fi

if [[ "$DO_BUILD" -eq 1 ]]; then
  sudo docker build -t "$IMAGE" "$REPO_ROOT"
fi

sudo docker stop "$CONTAINER" 2>/dev/null || true
sudo docker rm "$CONTAINER" 2>/dev/null || true

sudo docker run -d --name "$CONTAINER" \
  -v "$REPO_ROOT:/app" \
  --env-file "$ENV_FILE" \
  "$IMAGE"

echo "Started $CONTAINER (image: $IMAGE). Logs: sudo docker logs -f $CONTAINER"
