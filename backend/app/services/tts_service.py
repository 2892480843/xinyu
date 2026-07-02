"""腾讯云情感语音合成（TTS）服务——把岛屿叙事读成「与情绪匹配的嗓音」。

设计原则：
- 可选增强：未配置密钥或调用失败时返回 None，由前端无缝降级到浏览器原生合成（断网也能读）。
- 确定性签名：用腾讯云 TC3-HMAC-SHA256 规范签名 TextToVoice 接口。
- 情绪 → 语速映射：疲惫/难过更慢更轻，愉悦更明快，让「被一个有温度的声音听见」成立。
"""

import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Callable, Optional
from urllib.parse import urlencode

import httpx

from app import config

logger = logging.getLogger("xinyu.tts")

_HOST = "tts.tencentcloudapi.com"
_SERVICE = "tts"
_ACTION = "TextToVoice"
_VERSION = "2019-08-23"
_STREAM_HOST = "tts.cloud.tencent.com"
_STREAM_PATH = "/stream_wsv2"
_STREAM_ACTION = "TextToStreamAudioWSv2"
WsConnect = Callable[[str, dict[str, str]], Any]

# 情绪 → 语速（腾讯云 Speed 取值约 [-2, 6]，0 为常速；负更慢）。克制温柔基调下整体偏慢。
_EMOTION_SPEED = {
    "tired": -1.0,
    "sad": -0.8,
    "lonely": -0.6,
    "helpless": -1.0,
    "anxious": -0.3,
    "calm": -0.2,
    "happy": 0.4,
    "angry": 0.0,
}


# 精选音色清单：贴合「温柔陪伴」调性，供前端做音色选择。
# id 为腾讯云 VoiceType；default=True 的那个会在用户未选择时使用。
# 只列常用、稳定的一批，避免把几百个音色一股脑塞给用户。
TTS_VOICES = [
    {"id": 101016, "label": "智瑜", "desc": "温柔女声", "gender": "female", "default": True},
    {"id": 101001, "label": "智瑜（通用）", "desc": "通用女声", "gender": "female"},
    {"id": 101013, "label": "智言", "desc": "亲和女声", "gender": "female"},
    {"id": 101018, "label": "智融", "desc": "温暖女声", "gender": "female"},
    {"id": 101015, "label": "智言（标准）", "desc": "标准女声", "gender": "female"},
    {"id": 101019, "label": "智芸", "desc": "知性女声", "gender": "female"},
    {"id": 101023, "label": "智楠", "desc": "稳重男声", "gender": "male"},
    {"id": 101022, "label": "智言（男）", "desc": "沉稳男声", "gender": "male"},
    {"id": 101020, "label": "智团", "desc": "清亮少年", "gender": "male"},
]


def tts_voice_options() -> list:
    """返回可选音色清单（深拷贝，避免外部误改模块常量）。"""
    return [dict(v) for v in TTS_VOICES]


def default_voice_type() -> int:
    """返回默认音色 id（标记 default 的那个，回落到配置项）。"""
    for v in TTS_VOICES:
        if v.get("default"):
            return int(v["id"])
    return int(config.TENCENT_TTS_VOICE_TYPE)


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


class TTSService:
    """腾讯云 TTS 封装。configured() 为假时整体降级（前端走浏览器原生）。"""

    def __init__(self, ws_connect: Optional[WsConnect] = None) -> None:
        self._client = httpx.Client(timeout=config.TENCENT_TTS_TIMEOUT)
        self._ws_connect = ws_connect or _default_ws_connect

    def configured(self) -> bool:
        return bool(config.TENCENT_TTS_SECRET_ID and config.TENCENT_TTS_SECRET_KEY)

    def streaming_configured(self) -> bool:
        return bool(self.configured() and config.TENCENT_TTS_APP_ID)

    def speed_for(self, emotion: str) -> float:
        return _EMOTION_SPEED.get(emotion, 0.0)

    def synthesize(self, text: str, emotion: str = "calm", voice: Optional[int] = None) -> Optional[bytes]:
        """合成音频字节（mp3）。未配置或任何失败均返回 None，交由前端降级。

        voice: 腾讯云 VoiceType；为 None 时用默认音色。
        """
        if not self.configured() or not (text or "").strip():
            return None
        try:
            return self._call(text.strip()[:300], emotion, voice)
        except Exception as e:  # 任何异常都降级，绝不影响主体验
            logger.warning("Tencent TTS 调用失败，降级浏览器原生: %s", e)
            return None

    async def stream(self, text: str, emotion: str = "calm", voice: Optional[int] = None) -> AsyncIterator[bytes]:
        """逐帧合成 mp3 音频。缺少 AppId 或调用失败时结束迭代，由前端回退整段 TTS。"""
        if not self.streaming_configured() or not (text or "").strip():
            return
        try:
            async for chunk in self._stream_call(text.strip()[:300], emotion, voice):
                yield chunk
        except Exception as e:  # 任何异常都降级，绝不影响主体验
            logger.warning("Tencent TTS 流式调用失败，降级整段 TTS: %s", e)
            return

    def _call(self, text: str, emotion: str, voice: Optional[int]) -> Optional[bytes]:
        secret_id = config.TENCENT_TTS_SECRET_ID
        secret_key = config.TENCENT_TTS_SECRET_KEY
        region = config.TENCENT_TTS_REGION

        # 用户选了具体音色就用它；否则用清单默认值；再否则回落到环境配置项
        voice_type = voice if voice else default_voice_type()
        params = {
            "Text": text,
            "SessionId": hashlib.md5((text + emotion).encode("utf-8")).hexdigest()[:32],
            "VoiceType": voice_type,
            "Codec": "mp3",
            "Speed": self.speed_for(emotion),
            "Volume": 0,
            "SampleRate": 16000,
        }
        payload = json.dumps(params, ensure_ascii=False)
        headers = self._auth_headers(secret_id, secret_key, region, payload)
        resp = self._client.post(
            "https://" + _HOST, headers=headers, content=payload.encode("utf-8")
        )
        resp.raise_for_status()
        data = resp.json()
        response = data.get("Response", {})
        if "Error" in response:
            logger.warning("Tencent TTS 返回错误: %s", response.get("Error"))
            return None
        audio_b64 = response.get("Audio")
        if not audio_b64:
            return None
        return base64.b64decode(audio_b64)

    async def _stream_call(self, text: str, emotion: str, voice: Optional[int]) -> AsyncIterator[bytes]:
        session_id = uuid.uuid4().hex
        url = self._signed_stream_url(emotion, voice, session_id)
        async with self._ws_connect(url, {}) as ws:
            await ws.send(json.dumps({
                "session_id": session_id,
                "message_id": uuid.uuid4().hex,
                "action": "ACTION_SYNTHESIS",
                "data": text,
            }, ensure_ascii=False))
            await ws.send(json.dumps({
                "session_id": session_id,
                "message_id": uuid.uuid4().hex,
                "action": "ACTION_COMPLETE",
                "data": "",
            }, ensure_ascii=False))

            async for message in ws:
                if isinstance(message, (bytes, bytearray)):
                    chunk = bytes(message)
                    if chunk:
                        yield chunk
                    continue

                event = _parse_event(message)
                code = event.get("code")
                if code not in (None, 0):
                    raise RuntimeError(str(event.get("message") or event))
                if event.get("final") == 1 or event.get("action") == "ACTION_COMPLETE":
                    break

    def _signed_stream_url(self, emotion: str, voice: Optional[int], session_id: str) -> str:
        now = int(time.time())
        params: dict[str, Any] = {
            "Action": _STREAM_ACTION,
            "AppId": config.TENCENT_TTS_APP_ID,
            "SecretId": config.TENCENT_TTS_SECRET_ID,
            "Timestamp": now,
            "Expired": now + 3600,
            "SessionId": session_id,
            "VoiceType": voice if voice else default_voice_type(),
            "Codec": "mp3",
            "SampleRate": 16000,
            "Speed": self.speed_for(emotion),
            "Volume": 0,
        }
        sign_query = urlencode(sorted(params.items()))
        sign_text = f"{_STREAM_HOST}{_STREAM_PATH}?{sign_query}"
        signature = base64.b64encode(
            hmac.new(config.TENCENT_TTS_SECRET_KEY.encode("utf-8"), sign_text.encode("utf-8"), hashlib.sha1).digest()
        ).decode("utf-8")
        params["Signature"] = signature
        return f"wss://{_STREAM_HOST}{_STREAM_PATH}?{urlencode(params)}"

    @staticmethod
    def _auth_headers(secret_id: str, secret_key: str, region: str, payload: str) -> dict:
        """TC3-HMAC-SHA256 签名（腾讯云标准算法）。"""
        algorithm = "TC3-HMAC-SHA256"
        timestamp = int(time.time())
        date = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d")
        ct = "application/json; charset=utf-8"

        # 1) 拼接规范请求串
        canonical_headers = f"content-type:{ct}\nhost:{_HOST}\nx-tc-action:{_ACTION.lower()}\n"
        signed_headers = "content-type;host;x-tc-action"
        hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        canonical_request = "\n".join(
            ["POST", "/", "", canonical_headers, signed_headers, hashed_payload]
        )

        # 2) 拼接待签名字符串
        credential_scope = f"{date}/{_SERVICE}/tc3_request"
        hashed_canonical = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
        string_to_sign = "\n".join([algorithm, str(timestamp), credential_scope, hashed_canonical])

        # 3) 计算签名
        secret_date = _sign(("TC3" + secret_key).encode("utf-8"), date)
        secret_service = _sign(secret_date, _SERVICE)
        secret_signing = _sign(secret_service, "tc3_request")
        signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        # 4) 拼接 Authorization
        authorization = (
            f"{algorithm} Credential={secret_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return {
            "Authorization": authorization,
            "Content-Type": ct,
            "Host": _HOST,
            "X-TC-Action": _ACTION,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": _VERSION,
            "X-TC-Region": region,
        }


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

    if headers:
        return websockets.connect(url, additional_headers=headers)
    return websockets.connect(url)
