"""岛屿物件（收藏物）持久化服务（PostgreSQL）。

记录玩家在岛上留下的每一个物件，形成可回看的收藏，并作为持久的、由玩家选择
驱动的岛屿元素叠加到 island_state 上。与情绪记忆共用同一个 Postgres 库，独立成表。
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from app import db


class ArtifactService:
    def __init__(self) -> None:
        # 不在构造（import 时）连库——首次读写经 db.connection() 惰性初始化，
        # 避免部署时 DB 短暂不可达导致模块 import 直接崩溃。
        pass

    def save(self, user_id: str, artifact: str, label: str, emotion: str) -> Dict[str, Any]:
        created_at = datetime.utcnow().isoformat() + "Z"
        with db.connection() as conn:
            row = conn.execute(
                "INSERT INTO artifacts (user_id, artifact, label, emotion, created_at) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (user_id, artifact, label, emotion, created_at),
            ).fetchone()
        return self._row_to_dict(row)

    def get_all(self, user_id: str) -> List[Dict[str, Any]]:
        with db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM artifacts WHERE user_id = %s ORDER BY id DESC", (user_id,)
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def distinct_keys(self, user_id: str, limit: int = 8) -> List[str]:
        """返回该用户最近留下的不重复物件 key（最新在前），用于叠加到岛屿场景。"""
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
        with db.connection() as conn:
            row = conn.execute(
                "UPDATE artifacts SET inscription = %s WHERE id = %s AND user_id = %s RETURNING *",
                (clean_text, artifact_id, user_id),
            ).fetchone()
        return self._row_to_dict(row) if row else None

    # 系统自动写入 inscription 的物件类型——这些不是用户在刻字 UI 手写的，
    # 时光回信只能用「用户亲手刻下的话」，不能把系统生成文案谎称成"你写下的"。
    _AUTO_INSCRIBED = ["silent_shell", "glyph_stone"]

    def latest_inscribed(self, user_id: str, before_iso: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """拿用户最新一枚「亲手刻字」的物件，用于 whisper 时光回信。
        - 排除系统自动刻字的物件（静默贝壳/心境石）；
        - before_iso 不为空时，只取 created_at 早于它的（营造「那天写下」的时光感）。"""
        params: list = [user_id, self._AUTO_INSCRIBED]
        time_clause = ""
        if before_iso:
            time_clause = " AND created_at < %s"
            params.append(before_iso)
        with db.connection() as conn:
            row = conn.execute(
                "SELECT * FROM artifacts WHERE user_id = %s AND inscription <> '' "
                f"AND artifact <> ALL(%s){time_clause} ORDER BY id DESC LIMIT 1",
                tuple(params),
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def delete_by_user_id(self, user_id: str) -> int:
        clean = (user_id or "").strip()
        if not clean:
            raise ValueError("user_id is required")
        with db.connection() as conn:
            cur = conn.execute("DELETE FROM artifacts WHERE user_id = %s", (clean,))
            return int(cur.rowcount or 0)

    @staticmethod
    def _row_to_dict(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not row:
            return {}
        return {
            "id": int(row["id"]),
            "user_id": row["user_id"],
            "artifact": row["artifact"],
            "label": row["label"],
            "emotion": row["emotion"],
            "created_at": row["created_at"],
            "inscription": row.get("inscription", "") or "",
        }
