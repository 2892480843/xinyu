#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../frontend"
exec npm run dev -- --host "${HOST:-127.0.0.1}" --port "${PORT:-5173}"
