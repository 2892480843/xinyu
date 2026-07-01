"""Versioned system knowledge for Xinyu Agent."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List

from app import db


KB_VERSION = "xinyu-kb-v1"


DEFAULT_KNOWLEDGE_ITEMS = [
    {
        "namespace": "healing",
        "title": "焦虑时先回到此刻",
        "content": "焦虑常把人带到还没发生的未来。回应时先接住，再用一次呼吸、脚下的地、风铃的一声把用户带回此刻。",
        "tags": ["anxious", "chat", "grounding"],
        "priority": 90,
    },
    {
        "namespace": "healing",
        "title": "疲惫时不再加油",
        "content": "疲惫回应先允许停下来，不布置任务，不说你要加油。可以给一个很小的动作，如喝口水或把肩膀放低。",
        "tags": ["tired", "chat", "boundary"],
        "priority": 88,
    },
    {
        "namespace": "safety",
        "title": "心屿不是医疗服务",
        "content": "心屿提供陪伴，不做心理或医疗诊断，不承诺疗效。危机内容由确定性安全层处理。",
        "tags": ["boundary", "diagnosis", "safety"],
        "priority": 100,
    },
    {
        "namespace": "world",
        "title": "岛屿意象池",
        "content": "回应可以自然使用海、潮汐、晨雾、灯塔、贝壳、风铃、天灯、礁石、海鸟、慢慢长出来的草木。",
        "tags": ["voice", "island", "chat"],
        "priority": 70,
    },
    {
        "namespace": "gameplay",
        "title": "无痕模式边界",
        "content": "无痕模式仍提供陪伴，但不写记忆、不留物件、不推进成长。回应不可主动引用私房话。",
        "tags": ["ephemeral", "privacy", "boundary"],
        "priority": 95,
    },
]


class KnowledgeBaseService:
    def ensure_seed(self) -> int:
        now = datetime.utcnow().isoformat() + "Z"
        inserted = 0
        with db.connection() as conn, conn.cursor() as cur:
            for item in DEFAULT_KNOWLEDGE_ITEMS:
                cur.execute(
                    """
                    INSERT INTO knowledge_items
                        (namespace, title, content, tags, priority, version, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s::jsonb, %s, %s, 1, %s, %s)
                    ON CONFLICT (namespace, title, version) DO NOTHING
                    """,
                    (
                        item["namespace"],
                        item["title"],
                        item["content"],
                        json.dumps(item["tags"], ensure_ascii=False),
                        int(item["priority"]),
                        KB_VERSION,
                        now,
                        now,
                    ),
                )
                inserted += int(cur.rowcount or 0)
        return inserted

    def version(self) -> str:
        return KB_VERSION

    def search(
        self,
        *,
        namespace: str = "",
        query: str = "",
        tags: List[str] | None = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        ns = (namespace or "").strip()
        n = max(1, min(int(limit or 5), 10))
        wanted_tags = {str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()}
        terms = [part for part in (query or "").replace("，", " ").replace("。", " ").split() if part]

        where = "WHERE is_active = 1"
        params: List[Any] = []
        if ns:
            where += " AND namespace = %s"
            params.append(ns)

        with db.connection() as conn:
            rows = conn.execute(
                f"SELECT * FROM knowledge_items {where} ORDER BY priority DESC, id DESC LIMIT %s",
                tuple(params + [n * 4]),
            ).fetchall()

        items = [self._row_to_dict(row) for row in rows]

        def score(item: Dict[str, Any]) -> int:
            tag_score = len(wanted_tags.intersection({t.lower() for t in item["tags"]}))
            text = item["title"] + "\n" + item["content"]
            term_score = sum(1 for term in terms if term in text)
            return tag_score * 3 + term_score

        ranked = sorted(items, key=lambda item: (score(item), item["priority"], item["id"]), reverse=True)
        return ranked[:n]

    def get_active_count(self) -> int:
        with db.connection() as conn:
            row = conn.execute("SELECT COUNT(*) AS n FROM knowledge_items WHERE is_active = 1").fetchone()
        return int(row["n"] if row else 0)

    @staticmethod
    def _row_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": int(row["id"]),
            "namespace": row["namespace"],
            "title": row["title"],
            "content": row["content"],
            "tags": list(row["tags"] or []),
            "priority": int(row["priority"]),
            "version": row["version"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
