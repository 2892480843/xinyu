"""Run deterministic Xinyu Agent knowledge-base quality gates."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["LLM_PROVIDER"] = "mock"
os.environ["VECTOR_ENABLED"] = "0"
os.environ["CHAT_API_KEY"] = ""

from app.main import app, agent_evaluation_service  # noqa: E402
from app import config  # noqa: E402


def main() -> int:
    config.CHAT_API_KEY = ""
    agent_evaluation_service.ensure_seed_cases()
    failures = []
    with TestClient(app) as client:
        for case in agent_evaluation_service.list_active_cases():
            if case["entrypoint"] == "agent_ask":
                response = client.post(
                    "/api/agent/ask",
                    json={"user_id": f"eval-{case['name']}", "question": case["input_text"]},
                )
                response.raise_for_status()
                output = response.json().get("answer", "")
            else:
                output = ""
            result = agent_evaluation_service.evaluate_text(case_name=case["name"], output_text=output)
            print(f"{case['name']}: {'PASS' if result['passed'] else 'FAIL'} {result['scores']}")
            if not result["passed"]:
                failures.append(case["name"])
    if failures:
        print("Failed cases: " + ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
