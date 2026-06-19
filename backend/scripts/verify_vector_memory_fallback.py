"""Verify reflect works when the local embedding model cannot be loaded.

With pgvector enabled but fastembed unavailable, the vector memory service must
report unavailable and reflect must fall back to recent (relational) memories
without erroring. Runs against the dedicated test database.
"""

from __future__ import annotations

import builtins
import os
import sys
from pathlib import Path

import psycopg
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://localhost:5432/xinyu_test")


def _reset_db() -> None:
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS memory_vectors, memories, artifacts, phrases CASCADE")
        conn.commit()


def main() -> None:
    os.environ["LLM_PROVIDER"] = "mock"
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    os.environ["VECTOR_ENABLED"] = "1"  # 开启向量，但下面拦截 fastembed 导入以模拟 embedding 不可用
    _reset_db()

    original_import = builtins.__import__

    def blocked_import(name: str, *args, **kwargs):
        if name == "fastembed" or name.startswith("fastembed."):
            raise ImportError("fastembed intentionally unavailable for fallback verification")
        return original_import(name, *args, **kwargs)

    builtins.__import__ = blocked_import
    try:
        from app.main import app, vector_memory_service  # pylint: disable=import-outside-toplevel

        # 触发懒加载：embedding 模型加载因被拦截而失败 -> 向量服务整体不可用
        assert vector_memory_service.available is False, "vector memory should be unavailable without embeddings"

        with TestClient(app) as client:
            first = client.post(
                "/api/reflect",
                json={"user_id": "vector-fallback-user", "text": "我今天加班到很晚，真的很累"},
            )
            first.raise_for_status()
            second = client.post(
                "/api/reflect",
                json={"user_id": "vector-fallback-user", "text": "我还是很疲惫，想先休息一下"},
            )
            second.raise_for_status()
            payload = second.json()
            assert payload["narrative"], "reflect should still generate narrative without embeddings"
            assert payload["safety"]["triggered"] is False, "fallback flow should stay in normal narrative path"

            memories = client.get("/api/memories?user_id=vector-fallback-user&limit=10")
            memories.raise_for_status()
            assert len(memories.json()["memories"]) == 2, "PostgreSQL persistence should remain available"
    finally:
        builtins.__import__ = original_import

    print("verify_vector_memory_fallback: ok")


if __name__ == "__main__":
    main()
