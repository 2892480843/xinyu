"""Agent run telemetry and feedback persistence."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List

from app import db


VALID_RATINGS = {"helpful", "inaccurate", "too_generic", "uncomfortable"}


class AgentTelemetryService:
    def record_run(
        self,
        *,
        user_id: str,
        entrypoint: str,
        input_text: str,
        tools_used: List[str],
        retrieved_refs: List[Dict[str, Any]],
        output_text: str,
        kb_version: str,
        prompt_version: str,
        safety_triggered: bool,
    ) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat() + "Z"
        with db.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO agent_runs
                    (user_id, entrypoint, input_text, tools_used, retrieved_refs, output_text,
                     kb_version, prompt_version, safety_triggered, created_at)
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    (user_id or "").strip(),
                    entrypoint,
                    (input_text or "")[:2000],
                    json.dumps(list(tools_used or []), ensure_ascii=False),
                    json.dumps(list(retrieved_refs or []), ensure_ascii=False),
                    (output_text or "")[:4000],
                    kb_version,
                    prompt_version,
                    1 if safety_triggered else 0,
                    now,
                ),
            ).fetchone()
        return self._run_row(row)

    def record_feedback(
        self,
        *,
        run_id: int,
        user_id: str,
        rating: str,
        reason: str = "",
        free_text: str = "",
    ) -> Dict[str, Any]:
        clean_rating = (rating or "").strip()
        if clean_rating not in VALID_RATINGS:
            raise ValueError("rating 不在白名单内")
        now = datetime.utcnow().isoformat() + "Z"
        with db.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO agent_feedback (run_id, user_id, rating, reason, free_text, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    int(run_id),
                    (user_id or "").strip(),
                    clean_rating,
                    (reason or "")[:120],
                    (free_text or "")[:500],
                    now,
                ),
            ).fetchone()
        return self._feedback_row(row)

    def delete_by_user_id(self, user_id: str) -> int:
        clean = (user_id or "").strip()
        if not clean:
            return 0
        with db.connection() as conn:
            cur = conn.execute("DELETE FROM agent_runs WHERE user_id = %s", (clean,))
            return int(cur.rowcount or 0)

    @staticmethod
    def _run_row(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": int(row["id"]),
            "user_id": row["user_id"],
            "entrypoint": row["entrypoint"],
            "input_text": row["input_text"],
            "tools_used": list(row["tools_used"] or []),
            "retrieved_refs": list(row["retrieved_refs"] or []),
            "output_text": row["output_text"],
            "kb_version": row["kb_version"],
            "prompt_version": row["prompt_version"],
            "safety_triggered": bool(row["safety_triggered"]),
            "created_at": row["created_at"],
        }

    @staticmethod
    def _feedback_row(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": int(row["id"]),
            "run_id": int(row["run_id"]),
            "user_id": row["user_id"],
            "rating": row["rating"],
            "reason": row["reason"],
            "free_text": row["free_text"],
            "created_at": row["created_at"],
        }
