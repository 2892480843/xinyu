"""岛屿物件（收藏物）持久化服务。

记录玩家在岛上留下的每一个物件，形成可回看的收藏，并作为持久的、
由玩家选择驱动的岛屿元素叠加到 island_state 上。与情绪记忆共用同一个
SQLite 文件，但独立成表。
"""

import os
import sqlite3
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from app import config


class ArtifactService:
    def __init__(self) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(config.MEMORY_DB)), exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        # 与 memory/phrase 服务写同一个库文件：WAL + busy_timeout 降低 database is locked 概率。
        conn = sqlite3.connect(config.MEMORY_DB, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    artifact TEXT NOT NULL,
                    label TEXT NOT NULL DEFAULT '',
                    emotion TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                )
                """
            )
            # 迁移：给已有表加 inscription 字段（用户的"刻字"），TEXT 默认空串
            cols = {row[1] for row in conn.execute("PRAGMA table_info(artifacts)").fetchall()}
            if "inscription" not in cols:
                conn.execute("ALTER TABLE artifacts ADD COLUMN inscription TEXT NOT NULL DEFAULT ''")
            conn.commit()

    def save(self, user_id: str, artifact: str, label: str, emotion: str) -> Dict[str, Any]:
        created_at = datetime.utcnow().isoformat() + "Z"
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO artifacts (user_id, artifact, label, emotion, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, artifact, label, emotion, created_at),
            )
            conn.commit()
            row = self._row_to_dict(conn.execute("SELECT * FROM artifacts WHERE id = ?", (cur.lastrowid,)).fetchone())
        return row

    def get_all(self, user_id: str) -> List[Dict[str, Any]]:
        with self._lock, self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM artifacts WHERE user_id = ? ORDER BY id DESC", (user_id,)
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def distinct_keys(self, user_id: str, limit: int = 8) -> List[str]:
        """返回该用户最近留下的不重复物件 key，用于叠加到岛屿场景。"""
        seen: List[str] = []
        for row in self.get_all(user_id):
            key = row["artifact"]
            if key not in seen:
                seen.append(key)
            if len(seen) >= limit:
                break
        return seen

    def inscribe(self, user_id: str, artifact_id: int, text: str) -> Optional[Dict[str, Any]]:
        """给一枚已留下的物件刻一句话。最多 80 字，空串则擦掉刻字。
        返回更新后的 artifact 行；找不到（不属于该 user_id 或 id 不存在）则返回 None。"""
        clean_text = (text or "").strip()[:80]
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                "UPDATE artifacts SET inscription = ? WHERE id = ? AND user_id = ?",
                (clean_text, artifact_id, user_id),
            )
            if cur.rowcount == 0:
                return None
            conn.commit()
            row = conn.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        return self._row_to_dict(row)

    # 系统自动写入 inscription 的物件类型——这些不是用户在刻字 UI 手写的，
    # 时光回信只能用「用户亲手刻下的话」，不能把系统生成文案谎称成"你写下的"。
    _AUTO_INSCRIBED = ("silent_shell", "glyph_stone")

    def latest_inscribed(self, user_id: str, before_iso: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """拿用户最新一枚「亲手刻字」的物件，用于 whisper 时光回信。
        - 排除系统自动刻字的物件（静默贝壳/心境石）；
        - before_iso 不为空时，只取 created_at 早于它的（营造「那天写下」的时光感）。"""
        placeholders = ",".join("?" for _ in self._AUTO_INSCRIBED)
        params: list = [user_id, *self._AUTO_INSCRIBED]
        time_clause = ""
        if before_iso:
            time_clause = " AND created_at < ?"
            params.append(before_iso)
        with self._lock, self._conn() as conn:
            row = conn.execute(
                f"SELECT * FROM artifacts WHERE user_id = ? AND inscription <> '' "
                f"AND artifact NOT IN ({placeholders}){time_clause} ORDER BY id DESC LIMIT 1",
                tuple(params),
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def delete_by_user_id(self, user_id: str) -> int:
        clean = (user_id or "").strip()
        if not clean:
            raise ValueError("user_id is required")
        with self._lock, self._conn() as conn:
            cur = conn.execute("DELETE FROM artifacts WHERE user_id = ?", (clean,))
            conn.commit()
            return int(cur.rowcount or 0)

    @staticmethod
    def _row_to_dict(row: Optional[sqlite3.Row]) -> Dict[str, Any]:
        if row is None:
            return {}
        keys = row.keys()  # sqlite3.Row.keys() 列出列名，安全应对迁移期老行
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "artifact": row["artifact"],
            "label": row["label"],
            "emotion": row["emotion"],
            "created_at": row["created_at"],
            "inscription": row["inscription"] if "inscription" in keys else "",
        }
