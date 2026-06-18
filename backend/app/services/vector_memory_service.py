"""Optional ChromaDB-backed semantic memory index.

SQLite remains the source of truth. This service only improves retrieval and
must never block the normal reflect flow when ChromaDB is unavailable.
"""

import logging
import os
from typing import Any, Dict, List, Optional

from app import config


logger = logging.getLogger("xinyu.vector_memory")


class VectorMemoryService:
    def __init__(self) -> None:
        self._collection: Optional[Any] = None
        self._available = False

        if not config.CHROMA_ENABLED:
            logger.info("ChromaDB vector memory disabled by config")
            return

        try:
            import chromadb  # type: ignore

            os.makedirs(config.CHROMA_DB_DIR, exist_ok=True)
            client = chromadb.PersistentClient(path=config.CHROMA_DB_DIR)
            self._collection = client.get_or_create_collection(name=config.CHROMA_COLLECTION)
            self._available = True
            logger.info("ChromaDB vector memory enabled: collection=%s", config.CHROMA_COLLECTION)
        except Exception as e:
            logger.warning("ChromaDB vector memory unavailable, falling back to SQLite recent memories: %s", e)
            self._collection = None
            self._available = False

    @property
    def available(self) -> bool:
        return self._available and self._collection is not None

    def add_memory(self, memory: Dict[str, Any]) -> bool:
        if not self.available:
            return False

        try:
            memory_id = str(memory["id"])
            self._collection.upsert(
                ids=[memory_id],
                documents=[self._document(memory)],
                metadatas=[
                    {
                        "memory_id": int(memory["id"]),
                        "user_id": str(memory.get("user_id", "demo-user")),
                        "emotion": str(memory.get("emotion", "calm")),
                        "intensity": float(memory.get("intensity", 0.5)),
                        "created_at": str(memory.get("created_at", "")),
                    }
                ],
            )
            return True
        except Exception as e:
            logger.warning("ChromaDB vector memory write failed, SQLite memory kept: %s", e)
            return False

    def search(self, user_id: str, query_text: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.available:
            return []

        n_results = max(1, min(limit or config.VECTOR_MEMORY_RESULTS, 10))
        try:
            result = self._collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where={"user_id": user_id},
                include=["metadatas"],
            )
            metadatas = result.get("metadatas") or [[]]
            return [m for m in metadatas[0] if isinstance(m, dict)]
        except Exception as e:
            logger.warning("ChromaDB vector memory search failed, falling back to SQLite recent memories: %s", e)
            return []

    def delete_by_user_id(self, user_id: str) -> bool:
        if not self.available:
            return False

        try:
            self._collection.delete(where={"user_id": user_id})
            return True
        except Exception as e:
            logger.warning("ChromaDB vector memory delete failed, SQLite memory may already be cleared: %s", e)
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
