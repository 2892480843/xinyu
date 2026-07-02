from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from typing import Any, AsyncIterator


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class _FakeSocket:
    def __init__(self, messages: list[Any]) -> None:
        self.messages = messages
        self.sent: list[Any] = []

    async def __aenter__(self) -> "_FakeSocket":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def send(self, data: Any) -> None:
        self.sent.append(data)

    def __aiter__(self) -> AsyncIterator[Any]:
        async def _iter() -> AsyncIterator[Any]:
            for message in self.messages:
                yield message

        return _iter()


class AliyunASRStreamingTest(unittest.TestCase):
    def test_stream_pcm_sends_pcm_and_yields_final_transcript(self) -> None:
        from app import config
        from app.services.aliyun_asr_service import AliyunASRService

        config.DASHSCOPE_API_KEY = "dashscope-test-key"
        fake = _FakeSocket(
            [
                json.dumps({"header": {"event": "task-started"}}),
                json.dumps({
                    "header": {"event": "result-generated"},
                    "payload": {
                        "output": {
                            "sentence": {
                                "text": "今天有点累",
                                "sentence_end": True,
                            }
                        }
                    },
                }),
                json.dumps({"header": {"event": "task-finished"}}),
            ]
        )
        calls: list[tuple[str, dict[str, str]]] = []

        def connect(url: str, headers: dict[str, str]) -> _FakeSocket:
            calls.append((url, headers))
            return fake

        service = AliyunASRService(ws_connect=connect)

        result = asyncio.run(service.transcribe_pcm([b"pcm-a", b"pcm-b"], sample_rate=16000))

        self.assertEqual(result, "今天有点累")
        self.assertEqual(calls[0][1]["Authorization"], "Bearer dashscope-test-key")
        self.assertIn("api-ws/v1/inference", calls[0][0])
        self.assertIsInstance(fake.sent[0], str)
        run_task = json.loads(fake.sent[0])
        self.assertEqual(run_task["header"]["action"], "run-task")
        self.assertEqual(run_task["payload"]["task"], "asr")
        self.assertEqual(run_task["payload"]["function"], "recognition")
        self.assertEqual(run_task["payload"]["parameters"]["format"], "pcm")
        self.assertEqual(run_task["payload"]["parameters"]["sample_rate"], 16000)
        self.assertEqual(fake.sent[1:3], [b"pcm-a", b"pcm-b"])
        finish_task = json.loads(fake.sent[3])
        self.assertEqual(finish_task["header"]["action"], "finish-task")

    def test_unconfigured_asr_returns_none(self) -> None:
        from app import config
        from app.services.aliyun_asr_service import AliyunASRService

        config.DASHSCOPE_API_KEY = ""

        result = asyncio.run(AliyunASRService().transcribe_pcm([b"pcm"], sample_rate=16000))

        self.assertIsNone(result)

    def test_realtime_stream_yields_partial_and_final_transcripts(self) -> None:
        from app import config
        from app.services.aliyun_asr_service import AliyunASRService

        config.DASHSCOPE_API_KEY = "dashscope-test-key"
        fake = _FakeSocket(
            [
                json.dumps({"header": {"event": "task-started"}}),
                json.dumps({
                    "header": {"event": "result-generated"},
                    "payload": {"output": {"sentence": {"text": "今天", "sentence_end": False}}},
                }),
                json.dumps({
                    "header": {"event": "result-generated"},
                    "payload": {"output": {"sentence": {"text": "今天有点累", "sentence_end": True}}},
                }),
                json.dumps({"header": {"event": "task-finished"}}),
            ]
        )

        def connect(url: str, headers: dict[str, str]) -> _FakeSocket:
            return fake

        async def chunks() -> AsyncIterator[bytes]:
            yield b"pcm-a"
            yield b"pcm-b"

        service = AliyunASRService(ws_connect=connect)

        events = asyncio.run(_collect_events(service.stream_pcm(chunks(), sample_rate=16000)))

        self.assertEqual(
            events,
            [
                {"event": "started", "provider": "aliyun"},
                {"event": "transcript", "transcript": "今天", "final": False},
                {"event": "transcript", "transcript": "今天有点累", "final": True},
                {"event": "done"},
            ],
        )
        run_task = json.loads(fake.sent[0])
        self.assertEqual(run_task["header"]["action"], "run-task")
        self.assertEqual(fake.sent[1:3], [b"pcm-a", b"pcm-b"])
        finish_task = json.loads(fake.sent[3])
        self.assertEqual(finish_task["header"]["action"], "finish-task")


async def _collect_events(source: AsyncIterator[dict[str, Any]]) -> list[dict[str, Any]]:
    return [event async for event in source]


if __name__ == "__main__":
    unittest.main()
