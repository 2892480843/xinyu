"""pgvector 语义记忆索引。

PostgreSQL 关系表仍是 source of truth；本服务只为「找回相关旧记忆」做语义近邻
检索：把倾诉文本经本地 embedding 编成向量，写入 memory_vectors（与 memories 同库），
检索时按 cosine 距离取 Top-K。

任何一环不可用（pgvector 扩展缺失 / embedding 不可用 / 写读失败）都安全降级——
返回空或 False，让 reflect 主流程回退到「最近记忆」，绝不报错阻塞。
memory_vectors 对 memories 设了 ON DELETE CASCADE，删记忆即自动清向量。
"""

import logging
from typing import Any, Dict, List, Optional

from app import config, db
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger("xinyu.vector_memory")


class VectorMemoryService:
    def __init__(self, embedding_service: EmbeddingService) -> None:
        self._embedding = embedding_service

    @property
    def available(self) -> bool:
        # 需同时满足：pgvector 扩展就绪 + 本地 embedding 可用
        return db.VECTOR_AVAILABLE and self._embedding.available

    def add_memory(self, memory: Dict[str, Any]) -> bool:
        if not self.available:
            return False

        vector = self._embedding.embed(self._document(memory))
        if vector is None:
            return False

        try:
            with db.connection() as conn:
                conn.execute(
                    "INSERT INTO memory_vectors (memory_id, user_id, emotion, intensity, created_at, embedding) "
                    "VALUES (%s, %s, %s, %s, %s, %s::vector) "
                    "ON CONFLICT (memory_id) DO UPDATE SET embedding = EXCLUDED.embedding",
                    (
                        int(memory["id"]),
                        str(memory.get("user_id", "demo-user")),
                        str(memory.get("emotion", "calm")),
                        float(memory.get("intensity", 0.5)),
                        str(memory.get("created_at", "")),
                        self._to_vector_literal(vector),
                    ),
                )
            return True
        except Exception as e:
            logger.warning("pgvector 写入失败，关系记忆已保留：%s", e)
            return False

    def search(self, user_id: str, query_text: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.available:
            return []

        vector = self._embedding.embed(query_text)
        if vector is None:
            return []

        n_results = max(1, min(limit or config.VECTOR_MEMORY_RESULTS, 10))
        try:
            with db.connection() as conn:
                rows = conn.execute(
                    "SELECT memory_id, user_id, emotion, intensity, created_at FROM memory_vectors "
                    "WHERE user_id = %s ORDER BY embedding <=> %s::vector LIMIT %s",
                    (user_id, self._to_vector_literal(vector), n_results),
                ).fetchall()
            return [
                {
                    "memory_id": int(r["memory_id"]),
                    "user_id": r["user_id"],
                    "emotion": r["emotion"],
                    "intensity": float(r["intensity"]),
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        except Exception as e:
            logger.warning("pgvector 检索失败，回退到最近记忆：%s", e)
            return []

    def delete_by_user_id(self, user_id: str) -> bool:
        if not db.VECTOR_AVAILABLE:
            return False
        try:
            with db.connection() as conn:
                conn.execute("DELETE FROM memory_vectors WHERE user_id = %s", (user_id,))
            return True
        except Exception as e:
            logger.warning("pgvector 删除失败（删记忆时 CASCADE 通常已清理）：%s", e)
            return False

    @staticmethod
    def build_query_text(text: str, emotion: str, summary: str) -> str:
        return f"{summary}\n{text}\n{emotion}"

    @staticmethod
    def _document(memory: Dict[str, Any]) -> str:
        summary = str(memory.get("summary", ""))
        text = str(memory.get("text", ""))
        emotion = str(memory.get("emotion", ""))
        return f"{summary}\n{text}\n{emotion}"

    @staticmethod
    def _to_vector_literal(vector: List[float]) -> str:
        """List[float] -> pgvector 文本字面量 '[1,2,3]'，配 ::vector 转换写入/检索。
        用文本字面量而非 Python 适配器，跨 psycopg/pgvector 版本最稳健。"""
        return "[" + ",".join(repr(float(x)) for x in vector) + "]"
