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
        self.sent: list[str] = []

    async def __aenter__(self) -> "_FakeSocket":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def send(self, data: str) -> None:
        self.sent.append(data)

    def __aiter__(self) -> AsyncIterator[Any]:
        async def _iter() -> AsyncIterator[Any]:
            for message in self.messages:
                yield message

        return _iter()


class _SequencedFakeSocket(_FakeSocket):
    def __init__(self) -> None:
        super().__init__([
            json.dumps({"header": {"event": "task-started"}}),
            b"audio-a",
            bytearray(b"audio-b"),
            json.dumps({"header": {"event": "task-finished"}}),
        ])
        self.send_counts_before_started: list[int] = []
        self.send_counts_after_started: list[int] = []

    def __aiter__(self) -> AsyncIterator[Any]:
        async def _iter() -> AsyncIterator[Any]:
            self.send_counts_before_started.append(len(self.sent))
            yield self.messages[0]
            self.send_counts_after_started.append(len(self.sent))
            for message in self.messages[1:]:
                yield message

        return _iter()


class TtsStreamingTest(unittest.TestCase):
    def test_aliyun_stream_yields_binary_audio_frames(self) -> None:
        from app import config
        from app.services.aliyun_tts_service import AliyunTTSService

        config.DASHSCOPE_API_KEY = "dashscope-test-key"
        fake = _SequencedFakeSocket()
        calls: list[tuple[str, dict[str, str]]] = []

        def connect(url: str, headers: dict[str, str]) -> _FakeSocket:
            calls.append((url, headers))
            return fake

        service = AliyunTTSService(ws_connect=connect)

        chunks = asyncio.run(_collect(service.stream("你好，岛屿", "calm", "longke_v2")))

        self.assertEqual(chunks, [b"audio-a", b"audio-b"])
        self.assertEqual(calls[0][1]["Authorization"], "Bearer dashscope-test-key")
        sent = [json.loads(item) for item in fake.sent]
        self.assertEqual(sent[0]["header"]["action"], "run-task")
        self.assertEqual(sent[0]["payload"].get("input"), {})
        self.assertEqual(fake.send_counts_before_started, [1])
        self.assertEqual(fake.send_counts_after_started, [3])
        self.assertEqual(sent[1]["header"]["action"], "continue-task")
        self.assertEqual(sent[1]["payload"]["input"]["text"], "你好，岛屿")
        self.assertEqual(sent[2]["header"]["action"], "finish-task")

    def test_tencent_stream_requires_app_id(self) -> None:
        from app import config
        from app.services.tts_service import TTSService

        config.TENCENT_TTS_SECRET_ID = "sid"
        config.TENCENT_TTS_SECRET_KEY = "skey"
        config.TENCENT_TTS_APP_ID = ""

        self.assertFalse(TTSService().streaming_configured())

    def test_tencent_stream_yields_binary_audio_frames(self) -> None:
        from app import config
        from app.services.tts_service import TTSService

        config.TENCENT_TTS_SECRET_ID = "sid"
        config.TENCENT_TTS_SECRET_KEY = "skey"
        config.TENCENT_TTS_APP_ID = "1250000000"
        fake = _FakeSocket(
            [
                json.dumps({"code": 0, "message": "ready"}),
                b"frame-1",
                b"frame-2",
                json.dumps({"code": 0, "final": 1}),
            ]
        )
        calls: list[tuple[str, dict[str, str]]] = []

        def connect(url: str, headers: dict[str, str]) -> _FakeSocket:
            calls.append((url, headers))
            return fake

        service = TTSService(ws_connect=connect)

        chunks = asyncio.run(_collect(service.stream("慢慢来", "tired", 101016)))

        self.assertEqual(chunks, [b"frame-1", b"frame-2"])
        self.assertIn("wss://tts.cloud.tencent.com/stream_wsv2?", calls[0][0])
        self.assertIn("Action=TextToStreamAudioWSv2", calls[0][0])
        self.assertIn("AppId=1250000000", calls[0][0])
        sent = [json.loads(item) for item in fake.sent]
        self.assertEqual(sent[0]["action"], "ACTION_SYNTHESIS")
        self.assertEqual(sent[0]["data"], "慢慢来")
        self.assertEqual(sent[1]["action"], "ACTION_COMPLETE")
        self.assertEqual(sent[1]["data"], "")


async def _collect(source: AsyncIterator[bytes]) -> list[bytes]:
    return [chunk async for chunk in source]


if __name__ == "__main__":
    unittest.main()
