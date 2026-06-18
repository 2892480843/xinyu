"""Verify reflect works when ChromaDB cannot be imported.

The script patches imports before loading the FastAPI app and uses temporary
SQLite/JSON/Chroma paths so local demo data stays untouched.
"""

from __future__ import annotations

import builtins
import os
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> None:
    original_import = builtins.__import__

    def blocked_import(name: str, *args, **kwargs):
        if name == "chromadb" or name.startswith("chromadb."):
            raise ImportError("chromadb intentionally unavailable for fallback verification")
        return original_import(name, *args, **kwargs)

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["LLM_PROVIDER"] = "mock"
        os.environ["MEMORY_DB"] = str(Path(tmp) / "memories.db")
        os.environ["MEMORY_JSON"] = str(Path(tmp) / "memories.json")
        os.environ["CHROMA_ENABLED"] = "1"
        os.environ["CHROMA_DB_DIR"] = str(Path(tmp) / "chroma")

        builtins.__import__ = blocked_import
        try:
            from app.main import app, vector_memory_service  # pylint: disable=import-outside-toplevel
        finally:
            builtins.__import__ = original_import

        assert vector_memory_service.available is False, "Vector memory service should mark ChromaDB unavailable"

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
            assert payload["narrative"], "reflect should still generate narrative without ChromaDB"
            assert payload["safety"]["triggered"] is False, "fallback flow should stay in normal narrative path"

            memories = client.get("/api/memories?user_id=vector-fallback-user&limit=10")
            memories.raise_for_status()
            assert len(memories.json()["memories"]) == 2, "SQLite persistence should remain available"

    print("verify_vector_memory_fallback: ok")


if __name__ == "__main__":
    main()
