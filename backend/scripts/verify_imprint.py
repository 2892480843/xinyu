"""Verify reflect responses include heart imprints.

The script uses a temporary memory database so it does not mutate local demo data.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _post_reflect(client: TestClient, text: str) -> dict:
    response = client.post("/api/reflect", json={"user_id": "verify-imprint", "text": text})
    response.raise_for_status()
    return response.json()


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["LLM_PROVIDER"] = "mock"
        os.environ["MEMORY_DB"] = str(Path(tmp) / "memories.db")
        os.environ["MEMORY_JSON"] = str(Path(tmp) / "memories.json")

        from app.main import app  # pylint: disable=import-outside-toplevel

        with TestClient(app) as client:
            normal = _post_reflect(client, "我今天有点累，但也想慢慢把事情做好")
            imprint = normal.get("imprint")
            assert isinstance(imprint, str), "normal response imprint should be a string"
            assert 20 <= len(imprint) <= 60, f"normal response imprint length out of range: {len(imprint)}"

            with client.websocket_connect("/ws/reflect") as websocket:
                websocket.send_json({"user_id": "verify-imprint", "text": "今天挺开心的，想把这份轻松留住"})
                done_result = None
                while True:
                    event = websocket.receive_json()
                    if event["event"] == "done":
                        done_result = event["result"]
                        break
                assert isinstance(done_result.get("imprint"), str), "websocket done.result imprint should be a string"

            risk = _post_reflect(client, "我真的彻底绝望崩溃了，完全撑不下去了，一点希望都没有，太无助了")
            assert risk["safety"]["triggered"] is True, "risk response should trigger safety"
            assert risk["narrative"] == "", "risk response narrative should be empty"
            assert risk.get("imprint") is None, "risk response imprint should be null"

    print("verify_imprint: ok")


if __name__ == "__main__":
    main()
