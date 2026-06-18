#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../backend"

if [ -x ".venv/bin/uvicorn" ]; then
  exec .venv/bin/uvicorn app.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
fi

exec uvicorn app.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
