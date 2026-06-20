#!/usr/bin/env bash
#
# 心屿 Postgres 备份脚本
# ----------------------
# 用 pg_dump 自定义格式（-Fc）导出 schema + 数据（含 memories / artifacts / phrases /
# memory_vectors 与 pgvector 索引定义），产物可用 restore_db.sh 还原。
#
# 连接串解析优先级：环境变量 DATABASE_URL > backend/.env 里的 DATABASE_URL > 本地默认。
#
# 用法：
#   bash backend/scripts/backup_db.sh
# 可选环境变量：
#   DATABASE_URL              目标库连接串
#   XINYU_BACKUP_DIR          备份目录（默认 backend/backups）
#   XINYU_BACKUP_RETENTION    保留最近几份（默认 14，其余自动清理）
#
# 建议接入 cron，例如每天 03:00：
#   0 3 * * * cd /var/www/xinyu && bash backend/scripts/backup_db.sh >> backend/logs/backup.log 2>&1
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$HERE")"

# 显式环境变量优先；否则尝试 backend/.env；最后回退本地默认（与 app/config.py 一致）。
ENV_DATABASE_URL="${DATABASE_URL:-}"
if [[ -f "$BACKEND_DIR/.env" ]]; then
  set -a; . "$BACKEND_DIR/.env"; set +a
fi
DATABASE_URL="${ENV_DATABASE_URL:-${DATABASE_URL:-postgresql://localhost:5432/xinyu}}"

BACKUP_DIR="${XINYU_BACKUP_DIR:-$BACKEND_DIR/backups}"
RETENTION="${XINYU_BACKUP_RETENTION:-14}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup] 错误：未找到 pg_dump，请先安装 PostgreSQL 客户端工具。" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/xinyu-$STAMP.dump"

echo "[backup] 源: $DATABASE_URL"
echo "[backup] pg_dump -> $OUT"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$OUT"
echo "[backup] 完成（$(du -h "$OUT" | cut -f1)）"

# 保留最近 RETENTION 份，清理更旧的
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/xinyu-*.dump 2>/dev/null | tail -n +$((RETENTION + 1)) || true)
for old in "${OLD[@]:-}"; do
  [[ -n "$old" ]] || continue
  echo "[backup] 清理旧备份: $old"
  rm -f "$old"
done
