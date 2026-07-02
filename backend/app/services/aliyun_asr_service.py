"""阿里云 Paraformer 语音识别（ASR）服务。

用于语音输入兜底：浏览器自带 SpeechRecognition 在部分网络环境会直接报
network；这里复用已配置的 DashScope API Key，把前端录到的短句 PCM 片段
送到 Paraformer 实时识别 WebSocket，返回最终文本。
"""

import asyncio
import json
import logging
import uuid
from typing import Any, AsyncIterator, Callable, Iterable, Optional

from app import config

logger = logging.getLogger("xinyu.aliyun_asr")

_WS_HOST = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
_MODEL = "paraformer-realtime-v2"
WsConnect = Callable[[str, dict[str, str]], Any]


class AliyunASRService:
    """短语音 ASR 封装。未配置或失败时返回 None，让前端保留文字输入。"""

    def __init__(self, ws_connect: Optional[WsConnect] = None) -> None:
        self._ws_connect = ws_connect or _default_ws_connect

    def configured(self) -> bool:
        return bool(config.DASHSCOPE_API_KEY)

    async def transcribe_pcm(self, chunks: Iterable[bytes], sample_rate: int = 16000) -> Optional[str]:
        """识别一段 mono signed 16-bit little-endian PCM 音频。

        chunks: 短音频分片。调用方负责限制总体大小与时长。
        sample_rate: 采样率。前端默认下采样到 16000 Hz。
        """
        clean_chunks = [bytes(chunk) for chunk in chunks if chunk]
        if not self.configured() or not clean_chunks:
            return None
        try:
            return await self._transcribe_pcm(clean_chunks, sample_rate)
        except Exception as e:  # 可选增强，失败不影响主输入链路
            logger.warning("阿里云 Paraformer ASR 调用失败，保留文字输入: %s", e)
            return None

    async def stream_pcm(self, chunks: AsyncIterator[bytes], sample_rate: int = 16000) -> AsyncIterator[dict[str, Any]]:
        """实时识别 PCM 音频流，逐步产出 started/transcript/done 事件。"""
        if not self.configured():
            yield {"event": "error", "code": "asr_unconfigured", "message": "语音识别未配置"}
            return
        try:
            async for event in self._stream_pcm(chunks, sample_rate):
                yield event
        except Exception as e:  # 可选增强，失败不影响主输入链路
            logger.warning("阿里云 Paraformer 实时 ASR 调用失败，保留文字输入: %s", e)
            yield {"event": "error", "code": "asr_failed", "message": "实时语音识别失败"}

    async def _transcribe_pcm(self, chunks: list[bytes], sample_rate: int) -> Optional[str]:
        task_id = str(uuid.uuid4())
        headers = {"Authorization": f"Bearer {config.DASHSCOPE_API_KEY}"}
        final_text = ""
        async with self._ws_connect(_stream_url(), headers) as ws:
            await ws.send(json.dumps({
                "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
                "payload": {
                    "task_group": "audio",
                    "task": "asr",
                    "function": "recognition",
                    "model": _MODEL,
                    "parameters": {
                        "format": "pcm",
                        "sample_rate": int(sample_rate),
                        "language_hints": ["zh", "en"],
                        "punctuation_prediction_enabled": True,
                        "semantic_punctuation_enabled": False,
                    },
                    "input": {},
                },
            }, ensure_ascii=False))

            started = False
            audio_sent = False
            async for message in ws:
                event = _parse_event(message)
                header = event.get("header") or {}
                name = header.get("event")
                if event.get("code") or name == "task-failed":
                    raise RuntimeError(str(event.get("message") or header.get("error_message") or event))

                if name == "task-started" and not started:
                    started = True
                    for chunk in chunks:
                        await ws.send(chunk)
                        # 给实时接口一个轻量节拍，避免本地短句瞬间灌满导致服务端分句不稳。
                        await asyncio.sleep(0.005)
                    await ws.send(json.dumps({
                        "header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"},
                        "payload": {"input": {}},
                    }, ensure_ascii=False))
                    audio_sent = True
                    continue

                if name == "result-generated":
                    sentence = ((event.get("payload") or {}).get("output") or {}).get("sentence") or {}
                    text = (sentence.get("text") or "").strip()
                    if text and sentence.get("sentence_end"):
                        final_text = text
                    elif text and not final_text:
                        final_text = text
                    continue

                if name == "task-finished":
                    break

            if not audio_sent:
                return None
        return final_text.strip() or None

    async def _stream_pcm(self, chunks: AsyncIterator[bytes], sample_rate: int) -> AsyncIterator[dict[str, Any]]:
        task_id = str(uuid.uuid4())
        headers = {"Authorization": f"Bearer {config.DASHSCOPE_API_KEY}"}
        started = asyncio.Event()
        done = asyncio.Event()

        async with self._ws_connect(_stream_url(), headers) as ws:
            await ws.send(json.dumps({
                "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
                "payload": {
                    "task_group": "audio",
                    "task": "asr",
                    "function": "recognition",
                    "model": _MODEL,
                    "parameters": {
                        "format": "pcm",
                        "sample_rate": int(sample_rate),
                        "language_hints": ["zh", "en"],
                        "punctuation_prediction_enabled": True,
                        "semantic_punctuation_enabled": False,
                    },
                    "input": {},
                },
            }, ensure_ascii=False))

            async def send_audio() -> None:
                await started.wait()
                async for chunk in chunks:
                    if done.is_set():
                        break
                    if chunk:
                        await ws.send(bytes(chunk))
                if not done.is_set():
                    await ws.send(json.dumps({
                        "header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"},
                        "payload": {"input": {}},
                    }, ensure_ascii=False))

            sender = asyncio.create_task(send_audio())
            try:
                async for message in ws:
                    event = _parse_event(message)
                    header = event.get("header") or {}
                    name = header.get("event")
                    if event.get("code") or name == "task-failed":
                        raise RuntimeError(str(event.get("message") or header.get("error_message") or event))

                    if name == "task-started":
                        started.set()
                        await asyncio.sleep(0)
                        yield {"event": "started", "provider": "aliyun"}
                        continue

                    if name == "result-generated":
                        sentence = ((event.get("payload") or {}).get("output") or {}).get("sentence") or {}
                        text = (sentence.get("text") or "").strip()
                        if text:
                            yield {
                                "event": "transcript",
                                "transcript": text,
                                "final": bool(sentence.get("sentence_end")),
                            }
                        continue

                    if name == "task-finished":
                        done.set()
                        yield {"event": "done"}
                        break
            finally:
                done.set()
                if not sender.done():
                    sender.cancel()
                try:
                    await sender
                except asyncio.CancelledError:
                    pass


def _stream_url() -> str:
    if config.DASHSCOPE_WORKSPACE_ID:
        return f"wss://{config.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"
    return _WS_HOST


def _parse_event(message: Any) -> dict:
    if isinstance(message, bytes):
        message = message.decode("utf-8", errors="ignore")
    if not isinstance(message, str) or not message.strip():
        return {}
    try:
        data = json.loads(message)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _default_ws_connect(url: str, headers: dict[str, str]) -> Any:
    import websockets  # pylint: disable=import-outside-toplevel

    return websockets.connect(url, additional_headers=headers)
