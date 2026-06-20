#!/usr/bin/env bash
#
# 心屿 Postgres 恢复脚本
# ----------------------
# 把 backup_db.sh 产出的 .dump 还原到目标库。使用 pg_restore --clean --if-exists，
# 会先删除再重建其中对象 —— 这是破坏性操作，默认需要交互确认。
#
# 用法：
#   bash backend/scripts/restore_db.sh <dump 文件> [目标 DATABASE_URL]
# 例：
#   bash backend/scripts/restore_db.sh backend/backups/xinyu-20260620-030000.dump
# 跳过确认（用于自动化）：
#   XINYU_ASSUME_YES=1 bash backend/scripts/restore_db.sh <dump 文件>
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$HERE")"

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  echo "用法: bash backend/scripts/restore_db.sh <dump 文件> [目标 DATABASE_URL]" >&2
  exit 1
fi
if [[ ! -f "$DUMP" ]]; then
  echo "[restore] 错误：找不到备份文件 $DUMP" >&2
  exit 1
fi

ENV_DATABASE_URL="${DATABASE_URL:-}"
if [[ -f "$BACKEND_DIR/.env" ]]; then
  set -a; . "$BACKEND_DIR/.env"; set +a
fi
TARGET="${2:-${ENV_DATABASE_URL:-${DATABASE_URL:-postgresql://localhost:5432/xinyu}}}"

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "[restore] 错误：未找到 pg_restore，请先安装 PostgreSQL 客户端工具。" >&2
  exit 1
fi

echo "[restore] 备份文件: $DUMP"
echo "[restore] 目标库:   $TARGET"
echo "[restore] 警告：将 DROP 并重建备份中包含的对象（--clean --if-exists）。"

if [[ "${XINYU_ASSUME_YES:-0}" != "1" ]]; then
  read -r -p "确认继续? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "已取消。"; exit 1; }
fi

pg_restore --dbname="$TARGET" --clean --if-exists --no-owner --no-privileges "$DUMP"
echo "[restore] 完成。"
