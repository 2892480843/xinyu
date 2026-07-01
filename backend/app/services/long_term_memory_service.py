"""Long-term memory insights for Xinyu Agent.

Raw memories stay in MemoryService. This service derives small, evidence-backed
insights and a compact profile so Agent prompts can stay short and traceable.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List

from app import db


PROFILE_VERSION = "xinyu-long-term-profile-v1"


class LongTermMemoryService:
    def __init__(self, memory_service: Any) -> None:
        self._memory_service = memory_service

    def refresh_for_user(self, user_id: str) -> Dict[str, Any]:
        clean = (user_id or "").strip() or "demo-user"
        memories = self._memory_service.get_all(clean)
        safe_memories = [m for m in memories if m.get("text")]
        now = datetime.utcnow().isoformat() + "Z"

        profile = self._build_profile(safe_memories)
        insights = self._build_insights(safe_memories)

        with db.connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM memory_insights WHERE user_id = %s", (clean,))
            for item in insights:
                cur.execute(
                    """
                    INSERT INTO memory_insights
                        (user_id, kind, content, evidence_memory_ids, confidence, valid_from, valid_until, status, created_at, updated_at)
                    VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        clean,
                        item["kind"],
                        item["content"],
                        json.dumps(item["evidence_memory_ids"], ensure_ascii=False),
                        item["confidence"],
                        now,
                        "",
                        "active",
                        now,
                        now,
                    ),
                )
            cur.execute(
                """
                INSERT INTO user_memory_profiles (user_id, profile_json, summary, version, created_at, updated_at)
                VALUES (%s, %s::jsonb, %s, %s, %s, %s)
                ON CONFLICT (user_id)
                DO UPDATE SET profile_json = EXCLUDED.profile_json,
                              summary = EXCLUDED.summary,
                              version = EXCLUDED.version,
                              updated_at = EXCLUDED.updated_at
                """,
                (
                    clean,
                    json.dumps(profile["profile_json"], ensure_ascii=False),
                    profile["summary"],
                    PROFILE_VERSION,
                    now,
                    now,
                ),
            )

        return {"user_id": clean, "insights_written": len(insights), "profile_version": PROFILE_VERSION}

    def get_profile(self, user_id: str) -> Dict[str, Any]:
        clean = (user_id or "").strip() or "demo-user"
        with db.connection() as conn:
            row = conn.execute(
                "SELECT * FROM user_memory_profiles WHERE user_id = %s",
                (clean,),
            ).fetchone()
        if not row:
            return {"user_id": clean, "profile_json": {}, "summary": "", "version": PROFILE_VERSION}
        return {
            "user_id": row["user_id"],
            "profile_json": dict(row["profile_json"] or {}),
            "summary": row["summary"],
            "version": row["version"],
            "updated_at": row["updated_at"],
        }

    def recall_insights(self, user_id: str, query: str = "", limit: int = 3) -> List[Dict[str, Any]]:
        clean = (user_id or "").strip() or "demo-user"
        n = max(1, min(int(limit or 3), 10))
        terms = [t for t in (query or "").replace("，", " ").replace("。", " ").split() if t]
        with db.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM memory_insights
                WHERE user_id = %s AND status = 'active'
                ORDER BY confidence DESC, id DESC
                LIMIT %s
                """,
                (clean, n * 3),
            ).fetchall()

        items = [self._row_to_dict(r) for r in rows]
        if terms:
            ranked = sorted(
                items,
                key=lambda item: sum(1 for term in terms if term in item["content"]),
                reverse=True,
            )
            return ranked[:n]
        return items[:n]

    def mark_insights_for_review(self, user_id: str, insight_ids: List[int]) -> int:
        clean = (user_id or "").strip()
        ids = [int(i) for i in insight_ids if i is not None]
        if not clean or not ids:
            return 0
        with db.connection() as conn:
            cur = conn.execute(
                "UPDATE memory_insights SET status = 'needs_review' WHERE user_id = %s AND id = ANY(%s)",
                (clean, ids),
            )
            return int(cur.rowcount or 0)

    def delete_by_user_id(self, user_id: str) -> int:
        clean = (user_id or "").strip()
        if not clean:
            return 0
        with db.connection() as conn:
            insight_cur = conn.execute("DELETE FROM memory_insights WHERE user_id = %s", (clean,))
            conn.execute("DELETE FROM user_memory_profiles WHERE user_id = %s", (clean,))
            return int(insight_cur.rowcount or 0)

    @staticmethod
    def _build_profile(memories: List[Dict[str, Any]]) -> Dict[str, Any]:
        emotion_counts = Counter(str(m.get("emotion", "calm")) for m in memories)
        top_emotions = [emotion for emotion, _ in emotion_counts.most_common(3)]
        repeated_terms = LongTermMemoryService._repeated_terms(memories)
        summary_parts = []
        if top_emotions:
            summary_parts.append("常见情绪：" + "、".join(top_emotions))
        if repeated_terms:
            summary_parts.append("反复出现的线索：" + "、".join(repeated_terms[:5]))
        summary = "；".join(summary_parts)[:600]
        return {
            "profile_json": {
                "emotion_counts": dict(emotion_counts),
                "top_emotions": top_emotions,
                "repeated_terms": repeated_terms[:10],
                "memory_count": len(memories),
            },
            "summary": summary,
        }

    @staticmethod
    def _build_insights(memories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        insights: List[Dict[str, Any]] = []
        by_emotion: Dict[str, List[Dict[str, Any]]] = {}
        for memory in memories:
            by_emotion.setdefault(str(memory.get("emotion", "calm")), []).append(memory)

        for emotion, group in by_emotion.items():
            if len(group) >= 2:
                evidence = [int(m["id"]) for m in group[:5] if m.get("id")]
                label = "焦虑" if emotion == "anxious" else emotion
                joined = "；".join(str(m.get("summary") or m.get("text", "")) for m in group[:3])
                insights.append(
                    {
                        "kind": (
                            "stress_pattern"
                            if emotion in {"anxious", "tired", "sad", "helpless", "angry", "lonely"}
                            else "emotion_pattern"
                        ),
                        "content": f"最近多次出现{label}相关记录：{joined}"[:500],
                        "evidence_memory_ids": evidence,
                        "confidence": min(0.95, 0.45 + 0.12 * len(evidence)),
                    }
                )

        repeated_terms = LongTermMemoryService._repeated_terms(memories)
        if repeated_terms:
            evidence = [int(m["id"]) for m in memories[:5] if m.get("id")]
            insights.append(
                {
                    "kind": "recurring_topic",
                    "content": "这些线索反复出现：" + "、".join(repeated_terms[:6]),
                    "evidence_memory_ids": evidence,
                    "confidence": min(0.9, 0.5 + 0.05 * len(repeated_terms)),
                }
            )
        return insights

    @staticmethod
    def _repeated_terms(memories: List[Dict[str, Any]]) -> List[str]:
        candidates = ["项目", "截止日期", "加班", "睡不着", "朋友", "家", "面试", "海浪", "休息", "孤独"]
        text = "\n".join(str(m.get("text", "")) + "\n" + str(m.get("summary", "")) for m in memories)
        return [term for term in candidates if text.count(term) >= 1]

    @staticmethod
    def _row_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": int(row["id"]),
            "user_id": row["user_id"],
            "kind": row["kind"],
            "content": row["content"],
            "evidence_memory_ids": list(row["evidence_memory_ids"] or []),
            "confidence": float(row["confidence"]),
            "valid_from": row["valid_from"],
            "valid_until": row["valid_until"],
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
